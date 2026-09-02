# API Documentation

Base path: `/api/v1` (except `GET /health`, unprefixed). Interactive OpenAPI docs are served at
runtime by FastAPI at `/docs` (Swagger UI) and `/redoc` — this document is a prose companion
grouped by domain, not a dump of that schema.

## Auth model, in one paragraph

Every route except `POST /auth/register`, `POST /auth/login`, and `POST /demo/session` requires
`Authorization: Bearer <token>` (a JWT from `app.core.security`, HS256, default 24h expiry —
`JWT_EXPIRES_MINUTES`). The token carries `organization_id`, `role`, and `read_only`; every
handler filters all data by the token's `organization_id` — never by a client-supplied org id. Two
dependency tiers gate handlers (`app/core/deps.py`):

- **`get_current_principal`** — any valid token, read-only or not. Used on every `GET` and on
  reads that are safe for demo sessions.
- **`require_write_access`** — same, plus rejects `read_only=true` tokens with `403 demo
  organizations are read-only`. Used on every mutating (`POST`/`PATCH`/`DELETE`) route in the
  core PM/consulting domains.
- **`require_permission("admin.access")`** — additionally checks the `role_permissions` table;
  gates the entire `/admin/*` surface.

A `read_only` token comes only from `POST /demo/session` (role `VIEWER`, 2h expiry, no
credentials required) — this is the public `/demo` entry point.

## Auth (`app/api/auth.py`, prefix `/api/v1/auth`)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/auth/register` | none | Creates a new `organizations` row + an `ADMIN` user in it; returns a token. Org slug is auto-deduplicated. |
| POST | `/auth/login` | none | Verifies bcrypt password hash, returns a token, logs `auth.login` to `audit_logs`. |
| GET | `/auth/me` | bearer | Current user's profile. `404` for a demo/read-only token (no real user row backs it). |

## Demo (`app/api/demo.py`, prefix `/api/v1/demo`)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/demo/session` | none | Issues a 2h, `read_only=true` token scoped to the seeded `is_demo=true` organization ("Vertex Technologies"). `503` if that org hasn't been seeded yet. |

## Projects (`app/api/projects.py`, prefix `/api/v1/projects`)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `` | bearer | List org's projects. |
| POST | `` | write | Create a project. |
| GET | `/{project_id}` | bearer | One project. |
| PATCH | `/{project_id}` | write | Partial update. |
| DELETE | `/{project_id}` | write | Delete (cascades tasks/milestones/risks/allocations/budget). |
| GET | `/{project_id}/health` | bearer | Health Score + full per-component penalty breakdown (schedule/budget/task/risk/resource/dependency) — the formula from `docs/PRODUCT_REQUIREMENTS.md`. |
| GET | `/{project_id}/forecast` | bearer | EVM cost forecast (`app/services/cost_forecast.py`) — always labeled a baseline estimate. |
| GET | `/{project_id}/ai-insights` | bearer | AI-narrated project analysis via `AIRouter.dispatch("analyze_project", ...)` — rate-limited, honest `source`. |

## Tasks (`app/api/tasks.py`, prefix `/api/v1`)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/projects/{project_id}/tasks` | bearer | List a project's tasks. |
| POST | `/projects/{project_id}/tasks` | write | Create a task. |
| GET | `/tasks/{task_id}` | bearer | One task. |
| PATCH | `/tasks/{task_id}` | write | Partial update (status, assignee, completion %, ...). |
| DELETE | `/tasks/{task_id}` | write | Delete. |
| POST | `/tasks/{task_id}/dependencies` | write | Add a dependency (`depends_on_task_id`). |
| DELETE | `/tasks/{task_id}/dependencies/{dependency_id}` | write | Remove one dependency row by id. |
| DELETE | `/tasks/{task_id}/dependencies` | write | Remove a dependency by `(task_id, depends_on_task_id)` pair. |
| POST | `/tasks/{task_id}/suggest-assignees` | bearer | Ranked candidate resources from Resource Optimization (`app/services/resource_optimization.py`) — skill match / availability / cost, with a one-line "why" per candidate. Read-only (a suggestion, not an assignment), so demo sessions can call it. |

## Milestones (`app/api/milestones.py`, prefix `/api/v1`)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/projects/{project_id}/milestones` | bearer | List. |
| POST | `/projects/{project_id}/milestones` | write | Create. |
| PATCH | `/milestones/{milestone_id}` | write | Update. |
| DELETE | `/milestones/{milestone_id}` | write | Delete. |

## Resources (`app/api/resources.py`, prefix `/api/v1`)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/resources` | bearer | Org's resource pool, each with derived `utilization_state`. |
| POST | `/resources` | write | Create. |
| PATCH | `/resources/{resource_id}` | write | Update. |
| DELETE | `/resources/{resource_id}` | write | Delete. |
| GET | `/projects/{project_id}/allocations` | bearer | A project's resource allocations. |
| POST | `/projects/{project_id}/allocations` | write | Allocate a resource to a project. |

## Risks (`app/api/risks.py`, prefix `/api/v1`)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/projects/{project_id}/risks` | bearer | List, each with derived `score`/`severity`. |
| POST | `/projects/{project_id}/risks` | write | Create. |
| PATCH | `/risks/{risk_id}` | write | Update. |
| DELETE | `/risks/{risk_id}` | write | Delete. |

## Budget (`app/api/budgets.py`, prefix `/api/v1/projects`)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/{project_id}/budget` | bearer | Budget + transaction ledger + burn summary. |
| POST | `/{project_id}/budget/transactions` | write | Record a transaction (updates `actual_cost` roll-up). |

## Dashboard (`app/api/dashboard.py`, prefix `/api/v1`)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/dashboard` | bearer | Org-scoped portfolio KPIs: project/status counts, avg health score, budget/resource utilization, risk counts by severity, upcoming deadlines. |
| GET | `/dashboard/stream` | bearer (or `?token=` — see note) | Server-Sent Events stream of the same payload as `GET /dashboard`; re-emits only when the recomputed payload actually changes, with SSE keep-alive comments otherwise (~4s tick). Uses `get_stream_principal`, which additionally accepts a `?token=` query param because `EventSource` can't set an `Authorization` header — restricted to this one read-only route for that reason. |

## AI (`app/api/ai.py`, prefix `/api/v1/ai`)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/ai/executive-brief` | bearer | Portfolio-wide AI narrative (`AIRouter.dispatch("generate_report", ...)`). Rate-limited (5/hr anonymous, 20/hr authenticated); demo sessions can call it (read, not a mutation). |
| POST | `/ai/assistant` | bearer | Natural-language Q&A over the org's real data, optionally scoped to one project (`project_id` in the body). Intent-routed in Demo AI mode (overload/blocking/risks/why-at-risk/next-steps/summary/generic — see `app/ai/providers/demo.py::answer_project_question`). |

See also the AI-adjacent routes on other routers: `GET /projects/{id}/ai-insights`,
`POST /documents/{id}/ask`, `POST /consulting/business-cases/{id}/roadmap`, and the AI narrative
section embedded in every `GET /reports/{report_type}` — all dispatch through the same
`AIRouter` described in `docs/AI_ARCHITECTURE.md`.

## Analytics (`app/api/analytics.py`, prefix `/api/v1`)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/analytics` | bearer | Budget burn trend, task-completion trend, and a point-in-time risk snapshot — all computed on demand from existing rows, no new tables, honestly labeled as a snapshot rather than a time series where the underlying data doesn't support one. |

## Reports (`app/api/reports.py`, prefix `/api/v1/reports`)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/reports/{report_type}` | bearer | One of 6 report types: `status`, `executive`, `risk`, `budget`, `ai_transformation`, `weekly`. Each report composes existing computed data into sections; every report except `risk` includes one AI-generated narrative section via `AIRouter.dispatch` (project-scoped `analyze_project` or portfolio-scoped `generate_report`); `risk` uses `analyze_risk` instead, a better fit for risk-specific narrative. |

## Documents (`app/api/documents.py`, prefix `/api/v1/documents`)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `` | write | Upload a PDF/DOCX/TXT (20MB max, MIME+magic-byte validated — see `docs/SECURITY.md`). Optional `project_id` form field. Starts `PENDING`; parsing/chunking/embedding run in a FastAPI `BackgroundTasks` job, moving the row through `PROCESSING` → `READY`\|`FAILED`. |
| GET | `` | bearer | List org's documents, optionally filtered by `project_id`. |
| GET | `/{document_id}` | bearer | One document's detail, including chunk count/status. |
| POST | `/{document_id}/ask` | bearer | Grounded Q&A: embeds the question, retrieves the top-5 most similar chunks via `pgvector`, and dispatches `answer_document_question` — the response cites which chunk/page it drew from. |

## Admin (`app/api/admin.py`, prefix `/api/v1/admin`, all routes require `admin.access` permission)

| Method | Path | Description |
| --- | --- | --- |
| GET | `/admin/users` | Org-scoped user list (never cross-tenant, even for an ADMIN). |
| GET | `/admin/organizations` | The caller's own organization's details + user/project counts. |
| GET | `/admin/ai-providers` | Live `AIRouter` circuit-breaker/availability snapshot per provider (gemini/groq/demo_ai). |
| GET | `/admin/ai-usage?hours=24` | Aggregated `ai_requests` stats over a trailing window (1h–30d). |
| GET | `/admin/audit-logs?action=&entity_type=&page=&page_size=` | Paginated, filterable audit trail. |
| GET | `/admin/feedback?page=&page_size=` | Paginated feedback submissions. |

## Feedback (`app/api/feedback.py`, prefix `/api/v1/feedback`)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `` | bearer (any, **including read-only**) | Submit free-text feedback — deliberately not gated behind `require_write_access`, so anonymous demo visitors can leave feedback too. |

## Consulting (`app/api/consulting.py`, prefix `/api/v1/consulting`)

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| POST | `/business-cases` | write | Create a business case (intake fields captured verbatim). |
| GET | `/business-cases` | bearer | List org's business cases. |
| GET | `/business-cases/{id}` | bearer | One business case. |
| PATCH | `/business-cases/{id}` | write | Update. |
| DELETE | `/business-cases/{id}` | write | Delete (cascades opportunities + roadmap phases). |
| POST | `/business-cases/{id}/opportunities` | write | Add a scored AI-opportunity candidate (6 dimensions, 1-5 each). |
| GET | `/business-cases/{id}/opportunities` | bearer | List, sorted by computed `overall_score` descending. |
| POST | `/business-cases/{id}/roi` | bearer | Evaluate the ROI formula against a request body — pure calculation, not persisted, so it's open to read-only sessions. |
| POST | `/business-cases/{id}/roadmap` | write | (Re)generate all 5 fixed roadmap phases: deterministic scaffold (duration/budget/resources) + one AI narrative dispatch per phase, grounded in the case's real intake + scored opportunities. Replaces any prior roadmap wholesale. Checks the AI rate limit once per phase (5 checks for one call). |
| GET | `/business-cases/{id}/roadmap` | bearer | Fetch the persisted roadmap phases, in `sequence_order`. |

## Health check

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/health` | none | `{"status": "ok", "environment": "..."}`. Not under `/api/v1` — used by the Docker `HEALTHCHECK` (see `docs/DEPLOYMENT.md`) and load balancers. |
