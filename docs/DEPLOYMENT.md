# Deployment

Two supported ways to run this app locally: the day-to-day dev flow, and the fully containerized
stack. Both are described below as they actually exist in this repo today — see "What a real
production deploy would still need" for the gap between this and a real production deployment.

## Option A — Local dev flow (fastest iteration)

This is what `docs/ARCHITECTURE.md`/`docs/PROJECT_PLAN.md` assume day to day: hot-reloading
backend and frontend processes on the host, talking to Postgres/Redis in Docker.

1. **Infra**: from the repo root,
   ```
   docker compose up -d postgres redis
   ```
   This starts `pgvector/pgvector:pg16` (container `aipcc-postgres`, port 5432, volume
   `aipcc-postgres-data`) and `redis:7-alpine` (container `aipcc-redis`, port 6379, volume
   `aipcc-redis-data`).
2. **Backend env**: create `backend/.env` from the repo-root `.env.example` (never commit the
   real file — it's gitignored). At minimum needs `DATABASE_URL`, `JWT_SECRET`,
   `JWT_EXPIRES_MINUTES`, `ENVIRONMENT`. `REDIS_URL` defaults to `redis://localhost:6379/0` if
   omitted. `GEMINI_API_KEY`/`GROQ_API_KEY` are optional — leave them unset to run entirely in
   Demo AI mode (see `docs/AI_ARCHITECTURE.md`).
3. **Backend**:
   ```
   cd backend
   pip install -r requirements.txt
   alembic upgrade head
   python -m app.seed        # optional: seeds the "Vertex Technologies" demo org
   uvicorn app.main:app --reload
   ```
   Serves on `http://localhost:8000`; `/health`, `/docs`, `/redoc` all work immediately.
4. **Frontend env**: create `frontend/.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1`.
5. **Frontend**:
   ```
   cd frontend
   npm install
   npm run dev
   ```
   Serves on `http://localhost:3000`.
6. **Golden path check**: visit `http://localhost:3000/demo` (no login needed) — dashboard KPIs
   should be non-zero and derived from seeded data, per `docs/PROJECT_PLAN.md`'s Phase 1
   acceptance criteria.

## Option B — Fully containerized stack (Phase 7)

`backend/Dockerfile`, `frontend/Dockerfile`, and the `backend`/`frontend` services added to the
repo-root `docker-compose.yml` let the whole stack run without any host-installed Python/Node
toolchain.

### What each image does

- **`backend/Dockerfile`** — two-stage build. Builder stage installs
  `backend/requirements.txt` into a venv (this pulls in `torch` transitively via
  `sentence-transformers`, the local embedding model used by Phase 3 document intelligence — the
  image is large, multiple GB, and that is expected: it's a real feature, not something to trim
  away). Runtime stage copies just the venv + app code onto a slim Python 3.12 base, runs as a
  non-root user, and its entrypoint (`backend/docker-entrypoint.sh`) runs `alembic upgrade head`
  before starting `uvicorn app.main:app --host 0.0.0.0 --port 8000`. A `HEALTHCHECK` polls
  `GET /health`.
- **`frontend/Dockerfile`** — three-stage build (`deps` → `builder` → `runner`). Requires
  `next.config.ts`'s `output: "standalone"` (added alongside these Dockerfiles specifically for
  this) so the runtime stage ships only the traced production server bundle
  (`.next/standalone`), not the full `node_modules` tree. `NEXT_PUBLIC_API_URL` is a **build
  ARG**, not a runtime env var — Next.js inlines `NEXT_PUBLIC_*` values into the client JS bundle
  at build time, so changing it means rebuilding the image
  (`docker compose build --build-arg` or the compose `args:` block), not just restarting the
  container.

### One source of truth for data

The containerized `backend` service is configured to talk to the **same** `postgres`/`redis`
services already in `docker-compose.yml` (container names `aipcc-postgres`/`aipcc-redis`), via
the compose network's internal DNS (`postgres`, `redis` — not `localhost`). It does **not** get
its own separate database or a separate seed step: `docker-compose.yml`'s `backend` service
overrides `DATABASE_URL`/`REDIS_URL` to the in-network hostnames while still pulling
`JWT_SECRET`/`JWT_EXPIRES_MINUTES`/`ENVIRONMENT`/`GEMINI_API_KEY`/`GROQ_API_KEY` from
`backend/.env` via `env_file:`. This was a deliberate choice over giving the container its own
Postgres volume — one dataset, no drift between "the data behind `localhost:8000`" and "the data
behind the container," and no need to re-run the seed script for a container-only demo dataset.
`backend/.env` must exist before `docker compose build`/`up backend` (create it per Option A step
2 first).

### Running it

```
docker compose build backend frontend
docker compose up -d backend frontend      # postgres/redis are already running from Option A,
                                            # or `docker compose up -d postgres redis backend frontend`
                                            # to start everything from a clean checkout
```

Default port mappings are `8000` (backend) and `3000` (frontend), matching Option A's dev ports
— by design, so `NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1` works unchanged whichever way
you're running the backend. **If you already have the Option A dev servers running on 8000/3000**
(as was the case during this feature's own verification — see below), override the host ports
instead of colliding with them:
```
BACKEND_PORT=8100 FRONTEND_PORT=3100 NEXT_PUBLIC_API_URL=http://localhost:8100/api/v1 \
  docker compose up -d backend frontend
```
Both `docker-compose.yml` services read `${BACKEND_PORT:-8000}`/`${FRONTEND_PORT:-3000}` for
exactly this reason.

Verify:
```
curl http://localhost:8000/health          # {"status":"ok","environment":"development"}
curl -X POST http://localhost:8000/api/v1/demo/session
curl -I http://localhost:3000/             # 200, text/html
```

Tear down just the app containers (leaving `postgres`/`redis` running for Option A):
```
docker compose stop backend frontend && docker compose rm -f backend frontend
```

### Verified

This exact flow was run end-to-end while writing these Dockerfiles: `docker compose build backend
frontend` completed clean (`torch`/`sentence-transformers` included, no missing system deps —
`python:3.12-slim` plus `build-essential` in the builder stage was sufficient, no source builds
were actually needed since every dependency has a prebuilt `manylinux` wheel for this platform).
`docker compose up -d backend frontend` with `BACKEND_PORT=8100`/`FRONTEND_PORT=3100` brought up
both containers `healthy`; `GET /health` returned `{"status":"ok",...}`, `POST
/api/v1/demo/session` returned a real token against the seeded "Vertex Technologies" org (proving
`alembic upgrade head` succeeded against the shared Postgres and the container reached it), and
`GET /` on the frontend container returned a real rendered HTML page. The test containers were
then stopped and removed, leaving only the pre-existing `aipcc-postgres`/`aipcc-redis` containers
and the host dev processes running.

## What a real production deploy would still need

This repo provides working Dockerfiles and a working local compose stack — it does **not**
provide a production deployment. Honestly, still missing:

- **Managed Postgres** — the compose `postgres` service uses a named Docker volume on the host;
  a real deployment needs a managed instance (RDS/Cloud SQL/etc.) with backups, PITR, and HA, not
  a single container.
- **Managed Redis** — same story; the compose `redis` service has no persistence guarantees
  beyond its volume and no HA.
- **Secrets management** — `backend/.env` is a local gitignored file today; production needs a
  real secrets manager (Vault, AWS Secrets Manager, etc.), not env files baked into a compose
  invocation.
- **TLS** — nothing in this repo terminates HTTPS; both containers serve plain HTTP on their
  ports. A production deploy needs a reverse proxy/load balancer/CDN doing TLS termination in
  front of both services.
- **CSP/HSTS and other edge security headers** — `SecurityHeadersMiddleware` (see
  `docs/SECURITY.md`) covers a small fixed set of headers; the rest belongs at that same
  proxy/CDN layer.
- **Horizontal scaling** — the AI layer's circuit-breaker state lives in-process
  (`docs/AI_ARCHITECTURE.md`), so running multiple backend replicas means each replica trips its
  own breaker independently; the rate limiter and cache are correctly shared (Redis-backed) but
  the app has not been load-tested behind multiple replicas.
- **CI/CD** — there is no GitHub Actions pipeline yet building/pushing these images (Phase 7,
  still open — see `docs/TODO.md`); building and pushing to a registry is a manual step today.
- **Object storage for uploads** — `backend/uploads/` is local disk inside the backend container
  (backed by the `aipcc-backend-uploads` named volume in compose); a multi-replica production
  deploy needs shared/object storage (S3-compatible) instead, since local disk isn't shared
  across replicas.
- **Structured logging/monitoring/alerting** — the app logs to stdout via Python's standard
  `logging`; there's no shipped log aggregation, metrics, or alerting configuration.
