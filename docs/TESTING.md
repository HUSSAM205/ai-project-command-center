# Testing

Testing strategy and philosophy for this project, per `docs/PROJECT_PLAN.md`'s Phase 7 ("Quality
& Ops"). The actual test suite lives in `backend/tests/` and is being built out by a separate,
concurrent workstream — this document describes the intended strategy and the foundational
fixtures already established there as of this writing, not a finished suite. Do not treat
anything here as a substitute for reading `backend/tests/` directly for current coverage.

## Philosophy

This codebase's own stated ethos is "no fake claims" (`docs/PROJECT_PLAN.md`) — no nav item for
functionality that doesn't work, cost forecasts labeled as baselines not ML, AI responses
carrying an honest `source`. Testing strategy follows the same principle: assertions should
verify *actual computed behavior* (the exact health-score formula, the exact EVM forecast
formula, the exact RBAC grant table), not just "the endpoint returns 200." A test suite for this
app that only checks status codes would miss the entire point of a system whose core value is
"every number is derived transparently and correctly."

Priorities, roughly in order:
1. **Deterministic core services are the highest-value target.** `health_score.py`,
   `cost_forecast.py`, `resource_optimization.py`, `opportunity_scoring.py`, `roi_calculator.py`,
   `transformation_roadmap.py` are pure functions with formulas fully documented in
   `docs/PRODUCT_REQUIREMENTS.md` — every clamp, every edge case (zero budget, no tasks, equal-
   cost resource pool, `implementation_cost <= 0`) is a concrete, checkable assertion, not a
   judgment call.
2. **Multi-tenancy isolation is a correctness property, not a feature** — per
   `docs/ARCHITECTURE.md`, a cross-tenant read is "a bug, not a feature, from day one." Every API
   test suite needs at least one two-organization test per resource type proving org A can never
   read/write org B's data.
3. **Demo-mode read-only enforcement is a security boundary** — every mutating endpoint needs a
   test asserting a `read_only=true` token gets `403`, not just that an authenticated token gets
   `200`.
4. **AI-layer failure modes need explicit coverage**, not just the happy path: no provider
   configured, a provider timing out, a provider erroring, the circuit breaker opening after 3
   consecutive failures, the rate limiter rejecting a 6th anonymous request in an hour, Redis
   itself being unreachable (must fail open, never take AI endpoints offline). `AIRouter` is
   deliberately designed so every one of these degrades to Demo AI rather than a 500 — the tests
   exist to hold that guarantee, not just to smoke-test that the AI endpoints work when
   everything is healthy.
5. **Security-relevant behavior** — RBAC (`require_permission` actually checking the DB, not a
   hardcoded role), JWT expiry/invalid-token handling, file upload validation (magic bytes, size
   limit, disguised-file rejection) — see `docs/SECURITY.md` for the exact behaviors that need
   coverage.

## What's established today (`backend/tests/conftest.py`)

The foundational test infrastructure already exists and sets real precedent for how the rest of
the suite should be written:

- **Isolated test database.** Tests run against a dedicated `aipcc_test` Postgres database
  (same server/credentials as dev, different database name) — never against the `aipcc` dev
  database that holds the demo seed data a running dev session may depend on. Created and
  migrated (`alembic upgrade head`) once per test session.
- **Isolated Redis.** Tests use Redis logical DB 15 (`redis://localhost:6379/15`), separate from
  the dev default (DB 0), so `AIRouter` cache/rate-limit keys from tests never collide with a
  running dev server's state.
- **Per-test cleanup, not per-test transactions.** A function-scoped autouse fixture
  `TRUNCATE`s every app table (excluding the static, migration-seeded `permissions`/
  `role_permissions` RBAC catalog) before each test, and flushes the Redis test DB. This was a
  deliberate choice over a transaction/savepoint-rollback strategy specifically so API tests via
  `TestClient` exercise the exact same session lifecycle (`get_db`, fresh session per request) as
  production — no `get_db` override needed to nest requests inside a test transaction.
- **Real app, real routers.** The `client` fixture wraps `fastapi.testclient.TestClient` around
  the actual `app.main.app` — no mocked router layer.
- **Multi-tenancy fixtures ready to use.** `org_a`/`org_b`/`headers_a`/`headers_b` register two
  independent organizations via the real `POST /auth/register` flow, purpose-built for the
  cross-tenant isolation tests called for in Priority 2 above. `make_token()` builds a JWT
  directly for role/read-only combinations the register flow can't produce (e.g. a demo-scoped
  `read_only=true` token, or a `MEMBER`/`VIEWER` role) without needing a full seed script.

## Test types called for (Phase 7 scope, per `docs/PROJECT_PLAN.md`)

- **Unit tests** — the deterministic services in isolation (no DB, no HTTP): health score
  penalty math, EVM forecast math, resource optimization scoring, opportunity scoring, ROI
  formula, roadmap phase scaffolding, document magic-byte detection, JWT encode/decode.
- **Integration tests** — repository functions against the real (test) Postgres: correct
  `organization_id` filtering, cascade deletes (deleting a project cascades tasks/milestones/
  risks/allocations/budget — see `docs/DATABASE_SCHEMA.md`), the `pgvector` similarity query
  behind document Q&A.
- **API tests** — full request/response cycles via `TestClient`: every route in
  `docs/API_DOCUMENTATION.md`, its auth requirement (`get_current_principal` vs
  `require_write_access` vs `require_permission("admin.access")`), its response schema, and its
  error paths (404 for another org's resource id, 403 for a demo write, 401 for a missing/
  expired/invalid token).
- **AI-failure tests** — see Priority 4 above. `AIRouter`'s live-provider HTTP calls should be
  mocked/faked at the `httpx` boundary (the suite already pulls in `respx` for exactly this,
  per `backend/requirements.txt`'s Phase 7 dependency block) rather than hitting real Gemini/Groq
  endpoints, so these tests are deterministic and don't burn real API quota.
- **Security tests** — RBAC enforcement (a `VIEWER` token hitting an admin route gets 403 even
  with a technically valid JWT), demo read-only enforcement across every mutating route, file
  upload validation (oversized file, empty file, legacy `.doc`, a renamed non-DOCX zip, a
  disguised extension).

## CI

Not yet implemented — `docs/TODO.md` lists "GitHub Actions CI" as still open under Phase 7,
alongside the test suite itself. Once the suite has meaningful coverage, CI should run it against
a real Postgres+Redis service (matching the `aipcc_test`/DB-15 isolation strategy above) on every
PR, plus `alembic upgrade head` as its own smoke test that migrations apply cleanly to a fresh
database — the same property `backend/Dockerfile`'s entrypoint relies on at container start (see
`docs/DEPLOYMENT.md`).

## Frontend testing

No frontend test tooling (Jest/Vitest/Playwright/etc.) exists in `frontend/package.json` as of
this writing — `npm run lint`/`npm run build`/`tsc` (via `next build`, which runs TypeScript
checking — verified during this feature's own Docker build, see `docs/DEPLOYMENT.md`) are the
only automated checks today. Frontend test strategy is out of scope for what's been decided so
far and is not claimed as done anywhere in this document.
