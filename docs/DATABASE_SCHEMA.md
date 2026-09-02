# Database Schema

PostgreSQL (`pgvector/pgvector:pg16`), managed entirely through Alembic migrations under
`backend/alembic/versions/`. SQLAlchemy 2.0 declarative models live in `backend/app/models/` —
this document is a readable companion to those, not a replacement for reading them; every model
class docstring/comment cited below is the actual source of truth in code.

Current migration chain (5 revisions, oldest → newest):
`6e6ab074b673_initial_schema` → `a1b2c3d4e5f6_ai_requests` → `b7c8d9e0f1a2_documents_and_chunks`
→ `c3d4e5f6a7b8_rbac_audit_feedback` → `d4e5f6a7b8c9_consulting_workspace`.

22 tables across 6 domains. All primary keys are UUIDs (`UUIDPKMixin`,
`backend/app/models/base.py`); most tables also carry `created_at` (`CreatedAtMixin`) and some
add `updated_at` (`TimestampMixin`).

## A note on derived values

Several fields described in `docs/PRODUCT_REQUIREMENTS.md` are **intentionally not columns** —
they're computed on every read by a deterministic service and never persisted as a second source
of truth:

| Value | Computed by | Never stored on |
| --- | --- | --- |
| `Project.health_score`, `risk_level` | `app/services/health_score.py` | `projects` |
| `Project` cost forecast | `app/services/cost_forecast.py` | `projects` |
| `Resource.utilization_state`, `current_workload_hours_per_week` | `app/services/resource_state.py` | `resources` |
| `Risk.score`, `severity` | `probability * impact` (inline) | `risks` |
| `AIOpportunity.overall_score` | `app/services/opportunity_scoring.py` | `ai_opportunities` |

## Domain 1 — Core PM (Phase 1)

### `organizations`
The multi-tenancy root. Every other domain table is scoped to one, directly or via its parent.
| Column | Notes |
| --- | --- |
| `id`, `created_at` | |
| `name`, `slug` (unique) | |
| `is_demo` (bool) | `true` for exactly one seeded row — "Vertex Technologies" — the public `/demo` org (see `app/api/demo.py`) |

### `users`
| Column | Notes |
| --- | --- |
| `organization_id` → `organizations.id` (CASCADE) | |
| `email` | unique **per org** (`uq_users_org_email`), not globally |
| `password_hash` | bcrypt via `passlib` |
| `full_name`, `role` (`ADMIN`\|`MANAGER`\|`MEMBER`\|`VIEWER`) | |

### `projects`
| Column | Notes |
| --- | --- |
| `organization_id`, `manager_id` → `users.id` (SET NULL) | |
| `name`, `description`, `client` | |
| `status` (`PLANNING`\|`ACTIVE`\|`ON_HOLD`\|`AT_RISK`\|`COMPLETED`\|`CANCELLED`), `priority` (`LOW`..`CRITICAL`) | |
| `start_date`, `end_date` | health score inputs |
| `budget`, `actual_cost` (numeric 14,2) | |
| `progress` (int 0-100) | manually set or task-rollup |
| `updated_at` | via `TimestampMixin` |

### `project_members`
Many-to-many join: `project_id`, `user_id`, `role_on_project` (free text).

### `tasks`
| Column | Notes |
| --- | --- |
| `project_id` (CASCADE) | |
| `assignee_id` → `resources.id` (SET NULL) | assignee is a **resource**, not a `users` row |
| `status` (`TODO`\|`IN_PROGRESS`\|`BLOCKED`\|`REVIEW`\|`DONE`), `priority` | |
| `estimated_hours`, `actual_hours`, `start_date`, `due_date` | |
| `completion_percentage` (int) | feeds `avg_task_completion` in Health Score |
| `required_skills` (text[]) | consumed only by Resource Optimization matching |

### `task_dependencies`
`task_id` is blocked until `depends_on_task_id` is `DONE`. Both FKs → `tasks.id` (CASCADE).

### `milestones`
`project_id` (CASCADE), `name`, `description`, `due_date`, `status`
(`PENDING`\|`AT_RISK`\|`COMPLETED`).

### `resources`
| Column | Notes |
| --- | --- |
| `organization_id` | resources are org-level, allocated across projects |
| `name`, `role`, `department`, `skills` (text[]) | |
| `hourly_cost` (numeric 10,2), `capacity_hours_per_week` (numeric 6,2, default 40) | |

### `resource_allocations`
`resource_id`, `project_id` (both CASCADE), `allocation_percent` (0-100), `start_date`,
`end_date` — the rows `current_workload_hours_per_week` is derived by summing over.

### `risks`
| Column | Notes |
| --- | --- |
| `project_id` (CASCADE) | |
| `category` (`SCHEDULE`\|`BUDGET`\|`RESOURCE`\|`TECHNICAL`\|`SECURITY`\|`OPERATIONAL`\|`DEPENDENCY`\|`EXTERNAL`) | |
| `probability`, `impact` (int, CHECK 1-5 each) | `score = probability * impact` (derived) |
| `owner`, `mitigation`, `status` (`OPEN`\|`MITIGATING`\|`CLOSED`) | |

### `budgets`
One row per project (`project_id` unique, CASCADE): `initial_budget`, `currency` (default
`"USD"`).

### `budget_transactions`
`project_id` (CASCADE), `description`, `amount` (numeric 14,2), `category`, `date` — the ledger
`actual_cost`/burn-trend analytics are computed from.

## Domain 2 — AI usage (Phase 2)

### `ai_requests`
One row per `AIRouter.dispatch()` call, success or failure (see `docs/AI_ARCHITECTURE.md`).
`organization_id` (CASCADE), `endpoint`, `provider_used`
(`"gemini"|"groq"|"cache"|"demo_ai"|"none"`), `success` (bool), `latency_ms` (int), `created_at`.
Backs `GET /api/v1/admin/ai-usage` and `GET /api/v1/admin/ai-providers`.

## Domain 3 — Documents / RAG (Phase 3)

### `documents`
| Column | Notes |
| --- | --- |
| `organization_id` (CASCADE), `project_id` → `projects.id` (CASCADE, nullable) | a document can be org-level or attached to a project |
| `filename`, `file_type` (`"pdf"\|"docx"\|"txt"`), `uploaded_by` → `users.id` (SET NULL) | |
| `storage_path` | local disk path under `backend/uploads/` (gitignored), never a cloud bucket |
| `file_size_bytes`, `status` (`PENDING`\|`PROCESSING`\|`READY`\|`FAILED`), `error_message` | |
| `extracted_text` | full parsed text, kept alongside chunks |

### `document_chunks`
`document_id` (CASCADE), `chunk_index`, `content`, `embedding` (`pgvector` `Vector(384)` —
`all-MiniLM-L6-v2`, generated locally via `sentence-transformers`, never a hosted embedding API),
`page_number` (nullable, PDFs only). This is the table `pgvector` cosine-similarity search runs
against for grounded document Q&A.

## Domain 4 — AI Consulting Workspace (Phase 4)

A separate strategy/business-case domain from the PM tables above — see
`app/models/consulting.py`'s module docstring.

### `business_cases`
`organization_id` (CASCADE), `name`, plus consultant-entered intake fields captured verbatim:
`business_problem`, `current_state`, `desired_state`, `objectives`, `constraints` (nullable),
`stakeholders` (nullable), `budget` (numeric), `timeline` (free text, e.g. "Q1-Q3 2026" — not a
parseable date range by design), `created_by` → `users.id` (SET NULL). These intake fields are
the **only** grounding input for the roadmap generator's AI narrative.

### `ai_opportunities`
Scored AI/automation use-case candidates under a business case. `business_case_id` (CASCADE),
`name`, `description`, and six 1-5 integer dimensions (each CHECK-constrained 1-5):
`business_impact`, `feasibility`, `data_readiness`, `cost`, `time_to_value`, `risk`.
`overall_score` is **not** a column — computed on read by
`app/services/opportunity_scoring.py`.

### `roadmap_phases`
One row per fixed transformation-roadmap phase (`phase` enum: `DISCOVERY`\|`DATA_READINESS`\|
`PILOT`\|`IMPLEMENTATION`\|`SCALE`) under a `business_case_id` (CASCADE). `duration_weeks`,
`resources` (JSONB list of role strings), `budget`, `sequence_order` are deterministic scaffold
values from `app/services/transformation_roadmap.py`; `objectives`/`deliverables`/`kpis`/`risks`
(all JSONB lists) are the AI-generated narrative content; `source`
(`"gemini"|"groq"|"cache"|"demo_ai"`) persists `AIResponse.source` so the UI can render an honest
badge without re-calling AI on every page load.

## Domain 5 — RBAC / Audit / Feedback (Phase 5)

### `permissions`
Static catalog, seeded by the `c3d4e5f6a7b8` migration itself (not via `app/seed.py`, so RBAC
works on a fresh checkout with no seed script run). `key` (unique, e.g. `"admin.access"`,
`"project.write"`), `description`.

### `role_permissions`
Many-to-many grant: `role` (string — the same values as `users.role`, not a foreign key into a
`roles` table by design, see `app/models/role.py`'s docstring) × `permission_id` →
`permissions.id` (CASCADE), unique on `(role, permission_id)`. Seeded grants (from the same
migration):

| Role | Grants |
| --- | --- |
| ADMIN | `admin.access`, `project.write`, `task.write`, `risk.write`, `budget.write`, `document.upload` |
| MANAGER | `project.write`, `task.write`, `risk.write`, `budget.write`, `document.upload` |
| MEMBER | `task.write`, `document.upload` |
| VIEWER | *(none)* |

`app.core.deps.require_permission(key)` checks this table at request time — today only
`"admin.access"` gates a live route (`/admin/*`); the rest of the catalog is seeded and ready for
future routers to adopt without another migration.

### `audit_logs`
`organization_id` (CASCADE), `actor_user_id` → `users.id` (SET NULL, nullable — anonymous demo
sessions have no real user), `action` (e.g. `"auth.login"`, `"document.uploaded"`,
`"admin.users_viewed"`), `entity_type`, `entity_id` (nullable), `metadata` (JSONB — Python
attribute `event_metadata`, since `metadata` is reserved by SQLAlchemy's declarative base),
`created_at`. Written by `app/services/audit.py::log_audit_event`, called additively from
existing write endpoints across auth/projects/tasks/risks/budgets/documents/admin — see that
module's docstring for the full call-site list.

### `feedback`
`organization_id` (CASCADE), `user_id` → `users.id` (SET NULL, nullable — demo sessions can
submit feedback too), `message` (free text), `created_at`. Deliberately simple: no
status/category workflow.

## Key relationships (text ER summary)

```
organizations 1───* users
organizations 1───* projects 1───* tasks 1───* task_dependencies (self-referential via tasks)
                          │              └──* (assignee_id) resources
                          ├───* milestones
                          ├───* risks
                          ├───* project_members ──* users
                          ├───1 budgets ──* budget_transactions
                          └───* resource_allocations ──* resources
organizations 1───* resources 1───* resource_allocations
organizations 1───* ai_requests
organizations 1───* documents (0..1 project_id) 1───* document_chunks
organizations 1───* business_cases 1───* ai_opportunities
                                    └───* roadmap_phases
organizations 1───* audit_logs, feedback
permissions   *───* role_permissions (role: string, not a users FK)
```
