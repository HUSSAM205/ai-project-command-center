# syntax=docker/dockerfile:1

# ---- builder: compile/install Python deps into an isolated venv -----------------------------
# Kept separate from the runtime stage so build tools (gcc, headers) and pip's cache never
# end up in the final image — this matters here because sentence-transformers pulls in torch,
# already a large dependency; there is no reason to double it with build-only layers.
FROM python:3.12-slim AS builder

WORKDIR /app

# build-essential covers the rare case a dependency has no manylinux wheel for this
# platform/Python combo and pip falls back to building from source (e.g. a transitive
# cryptography/bcrypt build). libpq-dev is NOT needed: psycopg[binary] ships its own
# bundled libpq, no system Postgres client library required.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

COPY requirements.txt .
# requirements.txt pulls in torch (via sentence-transformers, Phase 3 document embeddings) —
# expect a multi-hundred-MB download here. That is a real feature of this image, not bloat
# to be trimmed.
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# ---- runtime: slim image that only carries the venv + app code ------------------------------
FROM python:3.12-slim AS runtime

# curl: used by the HEALTHCHECK below to hit GET /health.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 --shell /usr/sbin/nologin appuser

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Same env vars as backend/.env (see app/core/config.py::Settings) — real values are supplied
# by docker-compose's `environment:`/`env_file:`, never baked into the image. DATABASE_URL and
# JWT_SECRET have no default in Settings, so the container intentionally fails fast at startup
# if they are not provided.
ENV ENVIRONMENT=production \
    JWT_EXPIRES_MINUTES=1440 \
    REDIS_URL=redis://redis:6379/0

COPY --chown=appuser:appuser . .

# sentence-transformers caches the local embedding model under this user's home directory the
# first time it runs; make sure appuser can write there (and to uploads/, for Phase 3 document
# storage — see app/services/document_storage.py) before dropping root.
RUN mkdir -p /app/uploads /home/appuser/.cache \
    && chown -R appuser:appuser /app/uploads /home/appuser/.cache

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
    CMD curl -fsS http://localhost:8000/health || exit 1

# alembic upgrade head, then uvicorn — see docker-entrypoint.sh. Invoked via `sh` rather than
# relying on the executable bit so it runs the same whether or not the bit survived checkout.
ENTRYPOINT ["sh", "/app/docker-entrypoint.sh"]
