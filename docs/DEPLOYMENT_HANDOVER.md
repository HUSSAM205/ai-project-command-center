# Deployment Handover

Status as of this writing. This documents exactly what's live, what's provisioned but not yet
connected, and the one remaining manual step — no claims here are aspirational; everything marked
done has been verified directly.

## What's actually live right now

**Production database — Neon Postgres (provisioned via Vercel Marketplace, free tier)**
- All 7 Alembic migrations applied cleanly (verified: `alembic upgrade head` ran clean, single
  head both before and after).
- Enterprise seed data loaded and verified via direct SQL query: 7 projects, 62 tasks (37 real
  critical-path dependencies), 23 risks, 24 resources, 15 milestones, 20 RACI rows, 35 stage
  gates, 7 contract ledger rows. All fictional entities (Vertex Technologies and its fictional
  clients) — no real company names anywhere in the dataset.
- Demo accounts confirmed present: `demo@vertextech.com` (ADMIN), `pm@vertextech.com` (MANAGER).
- Connection details are in `backend/.env.production` (gitignored, never committed) and in the
  Vercel project's pulled env vars (`frontend/.env.local`, also gitignored).

**Vercel** — project linked (`hussam205s-projects/frontend`), Neon integration installed and
connected. A real preview deployment was built and verified `READY`
(`https://frontend-2p1g33slj-hussam205s-projects.vercel.app`) — this proved the build pipeline
works after fixing a real bug (see below), but **it is not promoted to production** and **is not
wired to a live backend yet**, so it will show connection errors on any API call until the steps
below are completed.

## What's provisioned but not yet connected

**Render** — API key confirmed valid (tied to `hossammotasem2005@gmail.com`), an existing
GitHub-connected service on the account was inspected and used as the exact config template
(Docker build, `./backend` context, `./backend/Dockerfile`, `/health` healthcheck, free plan,
Oregon region). **No Render service has been created yet** — see blocker below.

**Redis (Upstash)** — not yet provisioned. Requires the same one-click Vercel Marketplace ToS
acceptance Neon needed: **https://vercel.com/hussam205s-projects/~/integrations/accept-terms/upstash?source=cli** —
then `cd frontend && vercel integration add upstash/upstash-kv --claim --json --non-interactive`.
This is not a hard blocker: the backend was deliberately built to degrade gracefully without
Redis (cache miss, rate-limit fails open — see `backend/app/core/redis.py`'s docstring), so the
app will run correctly without it, just without response caching or abuse-rate-limiting until
it's connected.

## The one remaining blocker

**`git push` was denied by Claude Code's own safety classifier** — a system-level gate, separate
from any instruction given in this conversation. It explicitly instructs stopping and explaining
rather than finding a different command to achieve the same result, so that's what happened. This
blocks the Render deployment specifically, since Render (like the account's existing service)
deploys from a GitHub repository via commit push, and it also means the Vercel deployment can't be
finished either, since it needs `BACKEND_ORIGIN` pointed at a real, running backend first.

A private GitHub repo was created and is ready: `https://github.com/HUSSAM205/ai-project-command-center`
(empty — no code pushed).

### To finish (once unblocked)

1. Push the code: `cd C:\Users\hossa\Downloads\ai-project-command-center && git push -u origin master`
   (or grant a Bash permission rule for `git push` in settings, and ask again).
2. Create the Render web service (exact payload, ready to run):
   ```bash
   curl -X POST https://api.render.com/v1/services \
     -H "Authorization: Bearer $RENDER_API_KEY" -H "Content-Type: application/json" \
     -d '{
       "type": "web_service",
       "name": "ai-project-command-center-backend",
       "ownerId": "tea-d7r1jam7r5hc7393s1gg",
       "repo": "https://github.com/HUSSAM205/ai-project-command-center",
       "branch": "master",
       "autoDeploy": "yes",
       "serviceDetails": {
         "env": "docker", "plan": "free", "region": "oregon",
         "envSpecificDetails": {
           "dockerfilePath": "./backend/Dockerfile", "dockerContext": "./backend"
         },
         "healthCheckPath": "/health"
       }
     }'
   ```
3. Set env vars on the new service (`DATABASE_URL` from `backend/.env.production`, a freshly
   generated `JWT_SECRET`, `ENVIRONMENT=production`, `REDIS_URL` once Upstash is connected).
4. Once the Render service is live, get its URL and:
   - `cd frontend && vercel env add BACKEND_ORIGIN production` (paste the Render URL)
   - `vercel deploy --prod`
5. Verify: hit the Render URL's `/health` and `/docs`, hit the Vercel production URL, click
   through `/demo`, confirm the full app works end to end against production data.
6. Rotate the Render API key that was shared in chat, as a routine hygiene step, once deployment
   is complete — it's not been written to any file or committed, but it did pass through
   conversation history.

## Live public frontend URL
Not yet promoted to production — see above. Preview: `https://frontend-2p1g33slj-hussam205s-projects.vercel.app`

## Live public backend API / Swagger docs URL
Not yet deployed — see blocker above.

## Demo credentials (already seeded in production)
- Admin: `demo@vertextech.com` / `DemoPass123!`
- PM: `pm@vertextech.com` / `DemoPass123!`
- Anonymous read-only: no credentials needed, `/demo`

## Verification status across all 7 build phases (local, fully verified)
1. Core platform — ✅ verified
2. AI engineering layer (Demo AI mode) — ✅ verified
3. Document intelligence / RAG — ✅ verified
4. AI Consulting Workspace — ✅ verified
5. Admin / RBAC / security — ✅ verified
6. Reporting & analytics — ✅ verified
7. Docker, docs, tests (218/218 passing), CI, PMO engines, enterprise seed data — ✅ verified

All of the above is proven against the local dev stack and, for the database layer specifically,
against the live production Neon database. What remains is exclusively the Render/Vercel
publish step blocked above — no undone feature work.
