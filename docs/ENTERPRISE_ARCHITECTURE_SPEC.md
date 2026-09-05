# Enterprise Architecture Specification

**Status of this document:** describes the system as it actually exists in the live codebase and
production deployment as of 2026-09-05, verified against the running source — not an aspirational
target. Where a capability described elsewhere (chat, marketing copy) does not yet exist, it is
called out explicitly as a gap rather than implied. This project has not undergone a SOC2 Type II
or ISO 27001 audit and makes no certification claim; §5 documents the real security *practices* in
place today, which is a different thing from a certification.

## 1. Entity-Relationship Model

All tables live in one Postgres schema (Neon, `pgvector` extension enabled for `document_chunks`).
Every business table is scoped by `organization_id` (multi-tenant by row, not by schema/DB) and
every repository query filters on it — there is no cross-org query path in the codebase.

```
organizations 1───* users
organizations 1───* projects
projects      1───* tasks                         (WBS: project → task; no task→subtask nesting today)
tasks         1───* task_dependencies              (edge table: task_id → depends_on_task_id, forms a DAG)
projects      1───* milestones
organizations 1───* resources
projects      *───* resources   via resource_allocations (allocation_percent, start/end dates)
projects      1───* risks
projects      1───1 budgets                        (BAC/actual_cost live on Project itself; Budget row holds category breakdown)
projects      1───* budget_transactions
projects      1───* documents  →  1───* document_chunks   (pgvector embedding column, dim=384)
projects      1───* raci_entries
projects      1───* stage_gates                    (G1..G5, UNIQUE(project_id, gate))
projects      1───1 contract_ledger
organizations 1───* audit_logs
organizations 1───* business_cases  (Consulting workspace)
permissions   *───* role_permissions  (role is a string matching users.role, not an FK — see §4)
organizations 1───* ai_requests      (usage ledger, not itself a rate limiter — see §3.4)
```

**Derived values are never persisted.** Health score, RAG status, EVM (PV/EV/CPI/SPI/EAC/VAC),
cost forecast, risk score/severity, resource utilization state, and SPOF flags are all computed on
every read from the columns above — there is no `health_score` write path, no `rag_status` column
migration, no cached EVM row. This is a deliberate, repeated architectural choice (see inline
docstrings in `app/services/*.py`) so a stored value can never silently drift from the inputs it's
supposed to represent. The trade-off, stated plainly: every list endpoint pays the CPU cost of
recomputing these on each request rather than reading a column — acceptable at this data volume,
and revisited if that ever stops being true.

**What does NOT exist as a first-class table today:**
- **Assumptions and Issues** — `risks` covers Risks only; there is no unified RAID register.
  Dependencies are represented structurally as `task_dependencies` (schedule graph), not as a RAID
  entry type. Building a real `raid_items` table (with a `kind` discriminator and the same
  contingency-budget linkage described in chat) is scoped, real work — not started.
- **Financial baselines as a versioned table** — `projects.budget`/`actual_cost` are single current
  values, not a baseline-vs-current history. EVM's "Planned Value" is derived from the project's
  start/end dates on every read (§2), not from a stored baseline snapshot, so there is currently no
  way to compare "the plan as approved on day 1" against "the plan as it looks today" — only
  against "today's dates," which is a real, disclosed simplification.

## 2. Mathematical Engines

### 2.1 Earned Value Management — `backend/app/services/evm.py`

Standard ANSI/EIA-748 terminology, computed live from `Project.budget`/`actual_cost`/`progress`
and the schedule window:

```
planned_pct = elapsed_days / total_days * 100        (app/services/common.py::compute_planned_pct)
PV  = planned_pct/100 * BAC
EV  = progress/100 * BAC
AC  = Project.actual_cost
CPI = EV / AC            (None if AC <= 0)
SPI = EV / PV            (None if PV <= 0)
EAC = BAC / CPI  if progress>0 and actual_cost>0, else BAC   (reused verbatim from cost_forecast.py
                                                               so /evm and /forecast never disagree)
VAC = BAC - EAC
```

Anomaly thresholds (fixed, documented, not runtime-tunable): CPI or SPI `< 0.80` → critical,
`< 0.90` → warning. Exposed at `GET /api/v1/projects/{id}/evm`.

### 2.2 Critical Path Method

**Lives in the frontend today** (`frontend/app/app/projects/[id]/page.tsx`, `topoOrder()` +
surrounding Monte Carlo code), not as a backend endpoint. It performs a real topological sort over
`task_dependencies` to compute execution order and feed the client-side Monte Carlo simulator
below — it does not yet compute or expose early/late start/finish or float/slack as named fields.
Flagged as a gap: a proper backend CPM service (early/late start/finish, total float per task,
critical-path highlighting independent of the Monte Carlo view) is real, scoped, buildable work
that has not been done.

### 2.3 Monte Carlo Delivery Forecasting — two engines, disclosed

There are genuinely two independent Monte Carlo implementations in this codebase, for two
different questions:

1. **Frontend, per-project, dependency-aware** (`runMonteCarloSimulation` in the project detail
   page): triangular distribution per task (optimistic ×0.8 / pessimistic ×1.5 of estimated
   hours), 1,000 iterations, respects the real task-dependency DAG via `topoOrder`, reports
   P50/P85/P95 total duration. This is what a visitor actually sees on a project page.
2. **Backend, portfolio-capable, historical-ratio-based**
   (`backend/app/services/monte_carlo.py::compute_monte_carlo_forecast`): bootstrap-resamples an
   org's real historical `actual_hours/estimated_hours` ratio from completed tasks (falling back to
   a disclosed gaussian assumption — `method` field says which — below `MIN_HISTORICAL_SAMPLES=5`),
   applies it to each remaining task's remaining hours, converts total hours to a calendar date via
   the project's real weekly resource capacity, 1,000 runs, P50/P85/P95 dates. Exposed at
   `GET /api/v1/projects/{id}/forecast/monte-carlo` and verified against the live database, but
   **deliberately not wired into any page** — it was built, then the frontend engine above was
   found to already exist and be more sophisticated on the dependency-graph dimension, and shipping
   two differently-numbered "Monte Carlo" outputs on one page was judged a credibility risk rather
   than a feature. It remains available as an API for a future page that wants a
   capacity-and-history-based forecast distinct from the per-task-variance one.

### 2.4 Resource Capacity Matrix & Single Point of Failure —
`backend/app/services/resource_state.py::compute_resource_project_matrix`

For every resource: real `resource_allocations` rows across projects, workload = capacity ×
allocation%, `is_single_point_of_failure = true` only when that resource is the *only* one
allocated to a given project (`len(resource_ids_by_project[project_id]) <= 1`) — a fact computed
from real allocation rows, never a heuristic or a fixed list. Verified against production: the
matrix currently reports 3 overloaded resources and 0 SPOFs (a genuine true negative, not
manufactured to look impressive).

### 2.5 Canonical RAG Status — `backend/app/services/rag_status.py`

Four-value enum (`ON_TRACK` / `AT_RISK` / `CRITICAL` / `COMPLETED`), computed — never stored —
from `(status, health_score, risk_level)` with fixed thresholds (`CRITICAL_HEALTH_THRESHOLD=40`,
`AT_RISK_HEALTH_THRESHOLD=65`). Mirrored byte-for-byte in `frontend/lib/ragStatus.ts` for the two
client-only code paths (sandbox project creation, offline-fallback construction) that cannot call
the backend.

### 2.6 What-If Scenario Engine — NEW this pass,
`backend/app/services/whatif.py` / `POST /api/v1/projects/{id}/what-if`

Not previously present. Takes three optional deltas — `delay_days`, `budget_delta`,
`scope_change_percent` (added/removed estimated hours across incomplete tasks, proportionally) —
and recomputes EVM (§2.1) and the historical-ratio Monte Carlo forecast (§2.3.2) against a
hypothetical project state, entirely in memory: **no database write occurs**. Returns
baseline-vs-scenario for BAC/EAC/VAC/CPI and P50/P85/P95 dates side by side. This is the one
genuinely new PMO engine added in this pass; it deliberately reuses the existing EVM/Monte Carlo
math rather than inventing a third formula set, so a scenario recalculation can never disagree with
the live numbers it started from.

## 3. Security & RBAC

### 3.1 Authentication

JWT (HS256), bcrypt password hashing for real accounts. Anonymous/demo visitors get a real,
short-lived (120 min), read-only JWT for the seeded demo organization (`POST /api/v1/demo/session`)
— scoped by a per-token random `sid` so the AI/upload rate limits below apply per-visitor, not
globally.

### 3.2 Authorization

Three layers, additive:
- `require_write_access` — blanket 403 for any mutating call on a `read_only` (demo) token.
- `require_role(*roles)` — hardcoded role check (`ADMIN`/`MANAGER`/`MEMBER`/`VIEWER`).
- `require_permission(key)` — checks the `role_permissions` → `permissions` tables (real rows,
  not an if/else), used today to gate `/admin/*`. The permission catalog is seeded broader than
  what's currently wired, specifically so new domain routes can adopt data-backed permission
  checks without another migration.

### 3.3 Input validation & injection protection

Every request body is a Pydantic v2 model; every query is built through SQLAlchemy's parameterized
ORM layer (no raw string-interpolated SQL anywhere in the codebase).

### 3.4 Abuse controls that exist today

- AI endpoints: `AIRouter.enforce_rate_limit` — 15/hour anonymous, 20/hour authenticated, scoped
  per-session/user, enforced from a real counter (Postgres-backed; Upstash Redis is provisioned in
  `requirements.txt` but **not connected** in this deployment — noted honestly rather than implied).
- Demo document uploads: 3/hour, 2MB cap, per anonymous session, real DB-counted.
- Client-side resilience against a burst platform-level 429 (distinct from the above two
  *intentional* 429s) — retried with backoff, never surfaced as a crash card (`frontend/lib/api.ts`).

**What does NOT exist today:** a general inbound API rate limiter (e.g. per-IP request throttling
at the app or edge layer) beyond the two purpose-built quotas above. This is a real gap for a
production-grade deployment, not yet closed, and closing it well (Upstash-backed, so it survives
the single-worker process restarting) is scoped work, not done in this pass.

### 3.5 Audit trail

`audit_logs` (immutable — no UPDATE/DELETE endpoint exists for it): actor, action, entity type/id,
JSON metadata, server-stamped timestamp. Populated today on login, project/task/risk/budget writes,
document upload, AI requests, and admin actions.

### 3.6 Transport & headers

TLS everywhere (Vercel + Render both terminate HTTPS; the frontend proxies API calls same-origin,
so the browser never makes a cross-origin request). `SecurityHeadersMiddleware` sets
`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`. No CSP header is currently
set — another real, disclosed gap rather than a silent omission.

## 4. Deployment topology

- **Frontend:** Next.js (App Router), Vercel, manual `vercel deploy --prod` (this project has no
  git-based Vercel auto-deploy configured).
- **Backend:** FastAPI, Render free tier, single Uvicorn worker, auto-deploys on push to `master`.
  A GitHub Actions workflow (`.github/workflows/backend-keepalive.yml`) pings `/health` every 10
  minutes to reduce free-tier cold starts — no third-party monitoring signup involved.
- **Database:** Neon serverless Postgres (pooled connection), `pgvector` extension for document
  embeddings (384-dim feature-hashing vectors — no ML framework dependency, see
  `app/services/embeddings.py`).
- **Known, disclosed capacity constraint:** the free-tier single-worker backend has limited CPU
  under concurrent load; `/health` itself (zero DB work) has been observed taking several seconds
  during bursts. This is an infrastructure constraint, not an application defect — the app is
  built to degrade gracefully around it (retry-with-backoff, honest offline-preview labeling)
  rather than to hide it.
