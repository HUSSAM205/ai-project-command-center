# Deployment Handover

**Status: live in production.** Every claim below was verified directly (curl against the real
URLs, a real browser load, direct SQL against the production database) — nothing here is
aspirational.

## Live public URLs

- **Frontend (Vercel, production):** https://frontend-eta-one-77.vercel.app
- **Backend API / Swagger docs (Render):** https://ai-project-command-center-backend.onrender.com/docs
- **Backend health check:** https://ai-project-command-center-backend.onrender.com/health

The frontend talks to the backend through a same-origin reverse proxy (`frontend/next.config.ts`
`rewrites()`, `BACKEND_ORIGIN` env var set to the Render URL) — the browser never makes a
cross-origin request, so there is zero CORS friction, and the public API path is simply
`https://frontend-eta-one-77.vercel.app/api/v1/*`.

## Demo credentials

- Admin: `demo@vertextech.com` / `DemoPass123!`
- PM: `pm@vertextech.com` / `DemoPass123!`
- Anonymous read-only: no credentials needed — click "Explore Live Demo" or go to `/demo`. Public
  visitors never need an API key of their own; the AI layer runs in Demo AI mode (real,
  data-driven output, zero external calls) since no Gemini/Groq keys are configured.

## What's actually running

**Neon Postgres** (Vercel Marketplace, free tier) — all 7 Alembic migrations applied, `pgvector`
extension confirmed installed, enterprise seed data loaded and verified via direct SQL query: 7
projects, 62 tasks (37 real critical-path dependencies), 23 risks, 24 resources, 15 milestones, 20
RACI rows, 35 stage gates, 7 contract ledger rows. All fictional entities — no real company names
anywhere in the dataset.

**Render web service** (`ai-project-command-center-backend`, free plan, Oregon region, Docker
build from `backend/Dockerfile`) — live and healthy. First deploy attempt failed
(`update_failed`): it auto-triggered at service creation, before the environment variables were
set, and crashed on startup with `DATABASE_URL`/`JWT_SECRET` missing. Fixed by confirming the env
vars were actually attached to the service, then triggering a fresh deploy with cache cleared —
that one went `live` cleanly.

**Vercel** (`hussam205s-projects/frontend`, production) — deployed after fixing a real build bug
along the way: `next.config.ts`'s `output: "standalone"` (needed for the Docker/self-hosted build
path) broke Vercel's own build pipeline; made conditional on a `DOCKER_BUILD=1` env var so both
deploy targets work.

**Not yet connected — not a blocker:** Redis (Upstash). Requires the same one-click Vercel
Marketplace ToS acceptance Neon needed:
https://vercel.com/hussam205s-projects/~/integrations/accept-terms/upstash?source=cli — then
`cd frontend && vercel integration add upstash/upstash-kv --claim --json --non-interactive`, and
add the resulting `REDIS_URL` to the Render service's env vars. The backend was deliberately built
to degrade gracefully without Redis (cache miss, rate-limit fails open — see
`backend/app/core/redis.py`'s docstring), so the app runs correctly without it; this only means
AI responses aren't cached and abuse rate-limiting isn't active yet.

**Source:** private GitHub repo, pushed: https://github.com/HUSSAM205/ai-project-command-center
(Render's `autoDeploy: yes` means every future push to `master` redeploys the backend
automatically).

## Housekeeping

- Rotate the Render API key that was shared in chat — it was kept memory-only and never written
  to a file or committed, but it did pass through conversation history.
- The demo passwords above are intentionally simple/public — this is the point of a public demo
  org; don't reuse this password pattern for any real account.
- **Render's free plan spins the service down after ~15 minutes of no traffic.** Observed directly
  during this build: a health check after an idle period got a `502` straight from Render's own
  edge (`x-render-routing: no-deploy` header — not an application error) while the container spun
  back up; a follow-up request a short time later succeeded normally. This is expected free-tier
  behavior, not a bug — a paid Render plan removes it, not done here since it costs money and
  wasn't asked for. **Mitigated in the frontend** (`frontend/lib/api.ts`/`api-pmo.ts`): GET
  requests automatically retry up to 3 times with backoff on a 502/503/504 before surfacing an
  error, so a visitor arriving during this window sees a normal (if slightly slower) load instead
  of an error page in most cases. Mutating requests are never auto-retried.
- **Confirmed post-deployment**: a routine doc-only commit auto-triggered a Render redeploy
  (`autoDeploy: yes`) and it went `live` cleanly on the first try — the pipeline itself is stable,
  not a one-off fluke from the initial manual fix.

## Verification performed (not just claimed)

- `curl https://.../health` → `{"status":"ok","environment":"production"}`
- `curl https://.../docs` → 200 (Swagger UI live)
- Logged in as `demo@vertextech.com` against the production API → real token, `GET /dashboard`
  returned `total_projects: 7, total_tasks: 62` (matches the seed exactly)
- `POST /api/v1/demo/session` (no credentials) → 201, real read-only token issued
- Same checks repeated *through the Vercel proxy* (not hitting Render directly) — identical
  results, confirming the reverse proxy is correctly wired
- Loaded `https://frontend-eta-one-77.vercel.app/demo` in a real browser — dashboard rendered with
  live data, SSE "Live" indicator connected, zero console errors
- Direct SQL query against the production Neon database confirmed `pgvector` extension and all
  PMO tables (`raci_entries`, `stage_gates`, `contract_ledger`) populated correctly

## Build phase status (all 7, fully verified — locally and now in production)

1. Core platform (projects/tasks/risks/budgets, health score, cost forecast, live dashboard)
2. AI engineering layer (AIRouter, Demo AI mode, Executive Brief, AI Assistant)
3. Document intelligence / RAG (local embeddings, pgvector, grounded Q&A)
4. AI Consulting Workspace (opportunity scoring, ROI calculator, transformation roadmap)
5. Admin / RBAC / security (audit logging, security headers)
6. Reporting & analytics (6 report types, PDF export, trend charts)
7. Docker, docs, 218/218 backend tests passing, CI, PMO engines (EVM/RACI/stage-gates/contract-
   ledger/boardroom-memos), enterprise-scale seed data, reverse proxy, hydration fixes
