# User Stories

Organized by the four persona types this product actually targets, per `docs/PRODUCT_REQUIREMENTS.md`
and the app's actual route structure (`frontend/app/`). Every story below maps to a real,
working feature — no story describes UI or an endpoint that doesn't exist in the code
(cross-referenced against `backend/app/api/*` and `frontend/app/*`).

Format: **As a `<persona>`, I want to `<capability>`, so that `<value>`.** with acceptance
criteria grounded in the actual computed behavior (health score formula, EVM forecast, demo
read-only enforcement, etc.) rather than generic placeholders.

---

## Persona: Project Manager

### 1. View portfolio health at a glance
As a PM, I want a dashboard summarizing all my organization's projects, so that I know where to
focus without opening each project individually.
- Given seeded/entered projects exist, `GET /api/v1/dashboard` returns total/active/at-risk/
  completed project counts, average health score, budget and resource utilization %, and risk
  counts by severity.
- The dashboard (`/app/dashboard`) updates live via `GET /dashboard/stream` (SSE) without a page
  refresh when underlying data changes.

### 2. Understand *why* a project is unhealthy
As a PM, I want to see the component breakdown behind a project's health score, so that I know
exactly what to fix, not just a single number.
- `GET /api/v1/projects/{id}/health` returns the score plus per-component penalties (schedule,
  budget, task, risk, resource, dependency) per the formula in
  `docs/PRODUCT_REQUIREMENTS.md`.
- A project marked `AT_RISK` always has a low computed health score reflecting that — never a
  status/score mismatch (enforced by the seed data's internal consistency and the formula itself
  being the only source of `risk_level`).

### 3. Forecast whether a project will go over budget
As a PM, I want an early-warning cost forecast, so that I can act before an overrun becomes
irreversible.
- `GET /api/v1/projects/{id}/forecast` returns an EVM-baseline forecast (`EAC = BAC / CPI`),
  explicitly labeled `"baseline estimate"`, never presented as a machine-learned prediction.
- With `progress <= 0` or `actual_cost <= 0`, the forecast honestly falls back to "insufficient
  data — using budget as baseline" rather than fabricating a number.

### 4. Manage tasks with dependencies and a Kanban/Gantt view
As a PM, I want to create tasks with dependencies and see them on both a Kanban board and a
Gantt chart, so that I can plan and re-sequence work visually.
- `POST /api/v1/projects/{id}/tasks` creates a task; `POST /api/v1/tasks/{id}/dependencies` links
  it to a blocker; a task is `BLOCKED` until its dependency is `DONE`.
- `/app/tasks` and the project detail Gantt view both render the same underlying task/dependency
  data — no separate mock dataset for either view.

### 5. Get an assignee recommendation instead of guessing
As a PM, I want ranked assignee suggestions for a task, so that I don't have to manually cross-
reference skills/availability/cost across every resource.
- `POST /api/v1/tasks/{id}/suggest-assignees` returns candidates ranked by
  `skill_match * 0.5 + availability * 0.35 + cost_score * 0.15`, each with a one-line "why"
  explanation (e.g. "95% skill match, 70% available, $35/hr") — never a black-box score.

### 6. See who's overloaded before it becomes a crisis
As a PM, I want resource utilization state surfaced automatically, so that I can rebalance load
before a team member burns out or a project slips.
- `GET /api/v1/resources` returns each resource's derived `utilization_state`
  (`UNDERUTILIZED`/`OPTIMAL`/`OVERLOADED`) from `workload / capacity`, computed fresh on every
  read from active `resource_allocations` — never a stale cached value.

### 7. Track risks on a probability × impact matrix
As a PM, I want risks placed automatically into severity buckets, so that I don't have to
manually triage which risks are urgent.
- `POST /api/v1/projects/{id}/risks` takes `probability`/`impact` (1-5 each); `severity` is
  derived from `score = probability * impact` (1-4 LOW, 5-9 MEDIUM, 10-16 HIGH, 17-25 CRITICAL)
  and rendered on the risk matrix view (`/app/risks`).

### 8. Record budget transactions and see the ledger
As a PM, I want to log actual spend against a project's budget, so that `actual_cost` and the
forecast stay accurate.
- `POST /api/v1/projects/{id}/budget/transactions` records one transaction; `GET
  /api/v1/projects/{id}/budget` returns the initial budget, the full transaction ledger, and a
  burn summary.

### 9. Ask an AI assistant plain-language questions about a project
As a PM, I want to ask "who is overloaded on this project?" or "what's blocking delivery?" in
plain language, so that I don't have to manually dig through tabs.
- `POST /api/v1/ai/assistant` answers project-scoped or portfolio-scoped questions, intent-
  routed (overload/blocking/risks/why-at-risk/next-steps/summary) even in Demo AI mode — never a
  generic "I don't know."
- The response always carries an honest `source` (`gemini`/`groq`/`cache`/`demo_ai`) rendered as
  a badge, so the PM knows whether they got a live model answer or the deterministic fallback.

### 10. Get an AI-narrated project summary grounded in real numbers
As a PM, I want a written project analysis, so that I can paste it into a status update without
writing it myself.
- `GET /api/v1/projects/{id}/ai-insights` narrates the already-computed health score breakdown,
  forecast, top risks, and blockers — every prompt template explicitly forbids the model from
  inventing numbers not already in the supplied context.

### 11. Upload a project document and ask questions about it
As a PM, I want to upload a PDF/DOCX requirements doc and ask questions grounded in its actual
content, so that I don't have to re-read the whole document to find an answer.
- `POST /api/v1/documents` uploads (20MB max, MIME+magic-byte validated), processes
  asynchronously to `READY`; `POST /api/v1/documents/{id}/ask` answers from the top-5 most
  similar `pgvector`-retrieved chunks, citing chunk index/page — never answering from outside
  knowledge.

---

## Persona: Executive / Portfolio Lead

### 12. See a cross-project view without opening each project
As an executive, I want a single portfolio-wide summary, so that I can assess overall program
health in one glance.
- The dashboard's `projects_by_status`/`risk_counts`/`avg_health_score` fields give a portfolio
  rollup, not per-project detail — the same `GET /api/v1/dashboard` payload the PM dashboard uses,
  scoped identically by `organization_id`.

### 13. Get an AI-written executive brief
As an executive, I want a narrated summary of portfolio status, so that I can review it in two
minutes instead of reading every project individually.
- `GET /api/v1/ai/executive-brief` narrates total/active/at-risk/completed projects, budget
  utilization, resource utilization, and the single lowest-health "top concern" project with its
  actual penalty drivers — grounded in `build_portfolio_context`, never generic filler text.

### 14. Generate a one-click status/executive/budget/risk/weekly/AI-transformation report
As an executive, I want pre-formatted reports I can print or share, so that I don't have to
manually compile one from the dashboard.
- `GET /api/v1/reports/{report_type}` supports 6 types (`status`, `executive`, `risk`, `budget`,
  `ai_transformation`, `weekly`); `/app/reports` renders a print view. Every report except `risk`
  includes one AI-narrated section reusing the same `AIRouter` dispatch as project/portfolio
  insights elsewhere — no separate, less-honest AI code path for reports.

### 15. See budget burn and task-completion trends over time
As an executive, I want to see whether spend and delivery are trending in the right direction,
so that I can catch a trend before it becomes a crisis.
- `GET /api/v1/analytics` returns `budget_burn_trend` and `task_completion_trend` computed from
  the actual transaction/task history — and an honestly-labeled point-in-time risk *snapshot*
  (not a fabricated time series) since risk data has no historical trend to compute from yet.

### 16. Know which projects are actually at risk and why, portfolio-wide
As an executive, I want the biggest portfolio-wide risk surfaced automatically, so that I know
where to intervene without reading every project's risk register.
- The executive brief and `weekly`/`ai_transformation` reports both surface
  `top_portfolio_risks` — the highest-severity open risks across the whole org, not just one
  project.

### 17. Trust that AI-generated numbers are never presented as more certain than they are
As an executive, I want every AI-touching number to be labeled honestly, so that I don't make a
decision based on a hallucinated figure believing it's precise.
- Cost forecasts are always labeled "baseline estimate," never "ML forecast"; every `AIResponse`
  carries a `confidence` score and a `source` field the frontend renders as a visible badge.

### 18. See portfolio status even when no AI provider is configured
As an executive, I want the platform to work the same day it's deployed, before any AI vendor
contract/key exists, so that I'm not blocked waiting on procurement.
- Every AI-touching endpoint has a working Demo AI fallback (`docs/AI_ARCHITECTURE.md`) — the
  executive brief, reports, and assistant all return real, data-driven prose with zero API keys
  configured.

### 19. Preview the platform without creating an account
As a prospective executive sponsor, I want a live, read-only demo, so that I can evaluate the
product before committing to a rollout.
- `/demo` issues a token via `POST /api/v1/demo/session` with no credentials, scoped to the
  seeded "Vertex Technologies" org, and every write endpoint correctly rejects that token with
  `403`.

---

## Persona: Consultant / Business Analyst (AI Consulting Workspace)

### 20. Capture a business case through a structured intake
As a consultant, I want to capture the business problem, current/desired state, objectives, and
constraints in one place, so that every downstream analysis (scoring, ROI, roadmap) is grounded
in the same real inputs.
- `POST /api/v1/consulting/business-cases` persists all intake fields verbatim
  (`business_problem`, `current_state`, `desired_state`, `objectives`, `constraints`,
  `stakeholders`, `budget`, `timeline`) — these are the only grounding input the roadmap
  generator's AI narrative is allowed to use.

### 21. Score candidate AI/automation opportunities transparently
As a consultant, I want a repeatable, explainable scoring method for opportunity candidates, so
that stakeholders trust the prioritization isn't arbitrary.
- `POST /api/v1/consulting/business-cases/{id}/opportunities` takes six 1-5 consultant-entered
  dimensions; `overall_score` is computed on read by a fixed, documented weighted formula
  (`app/services/opportunity_scoring.py`) — never AI-generated, never a black box.

### 22. See opportunities ranked on an impact-vs-feasibility view
As a consultant, I want opportunities automatically ranked, so that I can present a prioritized
shortlist instead of an unordered list.
- `GET /api/v1/consulting/business-cases/{id}/opportunities` returns opportunities sorted by
  computed `overall_score` descending, feeding the impact/feasibility matrix in
  `/app/consulting/[id]`.

### 23. Calculate ROI with a transparent, auditable formula
As a consultant, I want an ROI calculator that shows its work, so that I can defend the numbers
in front of a skeptical stakeholder.
- `POST /api/v1/consulting/business-cases/{id}/roi` returns `efficiency_savings`,
  `annual_benefit`, `net_benefit`, `roi_percent`, `payback_period_months`, **and** the literal
  formula string used — a pure calculation, no AI, no persistence.
- Edge cases are handled honestly: `roi_percent` is `None` (not `0`) when
  `implementation_cost <= 0` (undefined, not zero); `payback_period_months` is `None` when the
  investment never pays back.

### 24. Generate a phased transformation roadmap grounded in the real business case
As a consultant, I want a structured, phased roadmap generated from the actual intake and scored
opportunities, so that I have a starting deliverable instead of a blank page.
- `POST /api/v1/consulting/business-cases/{id}/roadmap` produces 5 fixed phases (Discovery →
  Data Readiness → Pilot → Implementation → Scale) with deterministic duration/budget/resource-
  role scaffolding, plus one AI-narrated objectives/deliverables/KPIs/risks section per phase,
  grounded in this specific business case (never generic boilerplate) — even in Demo AI mode,
  which falls back to the same deterministic document-extraction logic used elsewhere rather than
  leaving any phase empty.

### 25. Regenerate a roadmap after opportunities change
As a consultant, I want to regenerate the roadmap after adding/rescoring opportunities, so that
the roadmap always reflects the latest analysis.
- Calling `POST .../roadmap` again wholesale replaces the prior roadmap (`delete_roadmap_phases_for_case`
  then re-create) — no stale phases left behind from an earlier iteration.

### 26. Know which AI provider actually generated each roadmap phase
As a consultant, I want to know whether a phase's narrative came from a live model or the
deterministic fallback, so that I can decide whether to review it more carefully before sharing
it externally.
- `RoadmapPhase.source` persists the `AIResponse.source` that produced it, so the UI can show a
  per-phase badge without re-calling AI just to check.

---

## Persona: Admin

### 27. See who has access to the organization
As an admin, I want a list of all users in my organization, so that I can audit access.
- `GET /api/v1/admin/users` — scoped strictly to the admin's own `organization_id`, gated by the
  `admin.access` permission (checked against the real `role_permissions` table, not a hardcoded
  role check).

### 28. Monitor AI provider health in real time
As an admin, I want to see whether Gemini/Groq are currently configured and healthy, so that I
can diagnose "why is everything running in Demo AI mode" without reading logs.
- `GET /api/v1/admin/ai-providers` returns a live snapshot per provider: `configured`,
  `available`, `circuit_open`, `consecutive_failures`, `cooldown_seconds_remaining` — read
  directly off the running `AIRouter` singleton's circuit-breaker state, not a separately
  tracked/stale copy.

### 29. See AI usage and cost-relevant volume
As an admin, I want aggregated AI request counts/success rates/latency over a time window, so
that I can gauge usage before it becomes a cost surprise.
- `GET /api/v1/admin/ai-usage?hours=24` (1h–720h window) aggregates the `ai_requests` table,
  populated by every single `AIRouter.dispatch()` call across the whole app.

### 30. Review an audit trail of sensitive actions
As an admin, I want a searchable audit log, so that I can investigate who did what and when.
- `GET /api/v1/admin/audit-logs?action=&entity_type=&page=&page_size=` — paginated and
  filterable, populated additively from login, project/task/risk writes, budget transactions,
  document uploads, every AI dispatch, and admin reads themselves.

### 31. Review user feedback in one place
As an admin, I want to see feedback submitted by users (including anonymous demo visitors), so
that I can act on product issues without a separate support channel.
- `GET /api/v1/admin/feedback?page=&page_size=` — paginated; feedback is deliberately open to
  read-only/demo sessions to submit (`POST /api/v1/feedback` is not gated behind
  `require_write_access`), so demo-visitor feedback shows up here too.

### 32. Trust that admin access is itself gated by a real permission check
As an admin (and as a security reviewer), I want `/admin/*` to be enforced by an actual
database-backed permission grant, not a hardcoded `if role == "ADMIN"`, so that access control is
auditable and changeable without a code deploy.
- Every `/admin/*` route depends on `require_permission("admin.access")`, which queries
  `role_permissions` joined to `permissions` at request time — see `docs/SECURITY.md` for the
  full RBAC model and its current gaps (only `admin.access` is actually enforced outside this
  router today).
