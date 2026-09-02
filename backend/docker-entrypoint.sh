#!/bin/sh
# Runs on every container start: apply any pending Alembic migrations, then hand off to
# uvicorn. Fails fast (set -e) — a container that can't migrate should not come up serving
# stale/mismatched schema.
set -e

echo "[entrypoint] running: alembic upgrade head"
alembic upgrade head

echo "[entrypoint] starting: uvicorn app.main:app"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
