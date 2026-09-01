# Product Requirements — Phase 1

This is the authoritative data contract and formula reference for Phase 1. Backend and frontend
must both conform to it exactly so they integrate without guesswork.

## Entities (Postgres tables, Phase 1 subset)

**organizations**: id (uuid), name, slug (unique), is_demo (bool, default false), created_at

**users**: id (uuid), organization_id (fk), email (unique per org), password_hash, full_name,
role (enum: ADMIN, MANAGER, MEMBER, VIEWER), created_at

**projects**: id (uuid), organization_id (fk), name, description, client, manager_id (fk users),
status (enum: PLANNING, ACTIVE, ON_HOLD, AT_RISK, COMPLETED, CANCELLED),
priority (enum: LOW, MEDIUM, HIGH, CRITICAL), start_date, end_date, budget (numeric),
actual_cost (numeric), progress (int 0-100, manually set or rolled up from tasks),
health_score (int 0-100, **computed**, not stored as source of truth — see Health Score),
risk_level (enum: LOW, MEDIUM, HIGH, CRITICAL, **derived from health_score**), created_at, updated_at

**project_members**: id, project_id (fk), user_id (fk), role_on_project (string)

**tasks**: id, project_id (fk), title, description, assignee_id (fk resources, nullable),
status (enum: TODO, IN_PROGRESS, BLOCKED, REVIEW, DONE),
priority (enum: LOW, MEDIUM, HIGH, CRITICAL), estimated_hours, actual_hours,
start_date, due_date, completion_percentage (int 0-100), required_skills (text[], nullable,
used only by Resource Optimization), created_at, updated_at

**task_dependencies**: id, task_id (fk), depends_on_task_id (fk) — task_id is blocked until
depends_on_task_id is DONE

**milestones**: id, project_id (fk), name, description, due_date,
status (enum: PENDING, AT_RISK, COMPLETED)

**resources**: id, organization_id (fk), name, role, department, skills (text[]),
hourly_cost (numeric), capacity_hours_per_week (numeric), current_workload_hours_per_week
(numeric, sum of active allocations), utilization_state (enum: UNDERUTILIZED, OPTIMAL, OVERLOADED,
**derived** — see Resource Utilization)

**resource_allocations**: id, resource_id (fk), project_id (fk), allocation_percent (0-100),
start_date, end_date

**risks**: id, project_id (fk), title, description,
category (enum: SCHEDULE, BUDGET, RESOURCE, TECHNICAL, SECURITY, OPERATIONAL, DEPENDENCY, EXTERNAL),
probability (int 1-5), impact (int 1-5), score (**computed** = probability * impact),
severity (enum: LOW, MEDIUM, HIGH, CRITICAL, **derived from score** — 1-4 LOW, 5-9 MEDIUM,
10-16 HIGH, 17-25 CRITICAL), owner, mitigation, status (enum: OPEN, MITIGATING, CLOSED)

**budgets**: id, project_id (fk, unique), initial_budget (numeric), currency (default "USD")

**budget_transactions**: id, project_id (fk), description, amount (numeric), category, date

## Derived-value rules (implement once in the backend; frontend only displays)

**Resource utilization_state**
```
ratio = current_workload_hours_per_week / capacity_hours_per_week
ratio < 0.6         -> UNDERUTILIZED
0.6 <= ratio <= 1.0 -> OPTIMAL
ratio > 1.0         -> OVERLOADED
```

**Risk severity** — from `score = probability * impact`: 1-4 LOW, 5-9 MEDIUM, 10-16 HIGH,
17-25 CRITICAL.

**Health Score** (0-100, subtract penalties from 100, clamp each penalty and the final score):
```
total_days     = max(1, (end_date - start_date).days)
elapsed_days   = clamp(today - start_date, 0, total_days)
planned_pct    = 100 * elapsed_days / total_days

schedule_penalty  = clamp((planned_pct - progress) * 0.6, 0, 30)

expected_spend_pct = planned_pct / 100
actual_spend_pct   = actual_cost / budget   if budget > 0 else 0
budget_penalty      = clamp((actual_spend_pct - expected_spend_pct) * 40, 0, 25)

avg_task_completion = average(task.completion_percentage for tasks in project), or progress if no tasks
task_penalty         = clamp((planned_pct - avg_task_completion) * 0.3, 0, 15)

top3_risk_scores = the 3 highest `score` values among OPEN/MITIGATING risks on this project (0 if none)
risk_penalty      = clamp(sum(top3_risk_scores) * 0.5, 0, 20)

overloaded_count  = count of distinct resources allocated to this project with utilization_state = OVERLOADED
resource_penalty  = clamp(overloaded_count * 4, 0, 12)

blocked_count      = count of this project's tasks with status = BLOCKED
dependency_penalty = clamp(blocked_count * 3, 0, 12)

health_score = clamp(100 - (schedule_penalty + budget_penalty + task_penalty + risk_penalty
                              + resource_penalty + dependency_penalty), 0, 100)
```
Return the per-component breakdown alongside the total (the UI shows it, per spec: "Schedule: -12,
Budget: -7, ...").

**Project risk_level** (derived from health_score): >=80 LOW, 60-79 MEDIUM, 40-59 HIGH, <40 CRITICAL.

**Cost Forecast** (EVM baseline — always label this "baseline estimate", never "ML forecast"):
```
if progress <= 0 or actual_cost <= 0:
    forecasted_final_cost = budget
    method = "insufficient data — using budget as baseline"
else:
    earned_value = (progress / 100) * budget
    cpi = earned_value / actual_cost                 # cost performance index
    forecasted_final_cost = budget / cpi              # EAC = BAC / CPI
    method = "baseline estimate (EVM: EAC = BAC / CPI)"

variance          = forecasted_final_cost - budget
variance_percent  = (variance / budget) * 100 if budget > 0 else 0
overrun_probability = clamp(5 + variance_percent * 1.2, 0, 95) if variance > 0
                      else clamp(15 + variance_percent * 0.5, 0, 20)
```

**Resource Optimization** — candidate ranking for a task (only among org resources):
```
skill_match_pct = 100 * |task.required_skills ∩ resource.skills| / |task.required_skills|
                  (100 if task.required_skills is empty)
availability_pct = 100 * (1 - current_workload_hours_per_week / capacity_hours_per_week), clamp 0-100
cost_score = 100 * (max_hourly_cost_in_pool - resource.hourly_cost) / (max_hourly_cost_in_pool - min_hourly_cost_in_pool)
             (100 if all candidates have equal cost)
overall = skill_match_pct * 0.5 + availability_pct * 0.35 + cost_score * 0.15
```
Return all three sub-scores plus `overall` and a one-line explanation string (e.g. "95% skill
match, 70% available, $35/hr — recommended") so the UI can show the *why*, per spec.

## REST API (Phase 1, prefix `/api/v1`)

- `POST /auth/register`, `POST /auth/login` -> `{access_token, user}`
- `GET /auth/me`
- `POST /demo/session` -> issues a read-only token scoped to the demo organization, no credentials
  required
- `GET/POST /projects`, `GET/PATCH/DELETE /projects/{id}`, `GET /projects/{id}/health`
  (breakdown from the formula above), `GET /projects/{id}/forecast`
- `GET/POST /projects/{id}/tasks`, `GET/PATCH/DELETE /tasks/{id}`,
  `POST/DELETE /tasks/{id}/dependencies`
- `GET/POST /projects/{id}/milestones`, `PATCH/DELETE /milestones/{id}`
- `GET/POST /resources`, `PATCH/DELETE /resources/{id}`,
  `GET/POST /projects/{id}/allocations`
- `POST /tasks/{id}/suggest-assignees` -> ranked candidates from Resource Optimization
- `GET/POST /projects/{id}/risks`, `PATCH/DELETE /risks/{id}`
- `GET /projects/{id}/budget`, `POST /projects/{id}/budget/transactions`
- `GET /dashboard` -> portfolio KPIs (org-scoped, or demo-scoped for anonymous demo sessions)

Every route (except `/auth/*` and `/demo/session`) requires a bearer token and filters all data by
the token's `organization_id`; a demo-scoped token's organization is the seeded demo org and its
write endpoints return `403`.

## Demo dataset targets (organization "Vertex Technologies", `is_demo = true`)

5 projects — *AI Customer Intelligence*, *Digital Transformation Program*, *Cloud Migration
Initiative*, *Enterprise Automation Platform*, *Smart Operations System* — spanning a realistic
mix of statuses/priorities so the dashboard shows genuine variety (at least one ACTIVE+healthy,
one AT_RISK, one ON_HOLD). 30+ tasks across them (mixed statuses including some BLOCKED), 10+
risks (mixed categories/severities), 10+ resources (mixed utilization states), budgets +
transactions per project, milestones per project. Data must be internally consistent: a project
whose computed health score comes out low should be the one flagged AT_RISK, not a coincidence.
