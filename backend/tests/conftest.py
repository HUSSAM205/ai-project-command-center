"""Shared pytest fixtures for the whole backend test suite.

Test database strategy (documented per the Phase 7 task): a dedicated Postgres database
(``aipcc_test``, same server/credentials as the dev DB defined in docker-compose.yml) is
created once per test *session* and migrated once via ``alembic upgrade head`` against it —
never against the ``aipcc`` dev database that holds the demo seed data. Within that session,
every test function gets a clean slate via `TRUNCATE ... CASCADE` on all app tables (excluding
the static `permissions`/`role_permissions` RBAC catalog seeded by the Phase 5 migration, which
never changes at runtime) in an autouse, function-scoped fixture. This is simpler and fast
enough for this suite than a per-test transaction/savepoint rollback would be, and it works
uniformly for both direct DB fixtures and FastAPI TestClient requests, which use their own
freshly-opened sessions per request (a shared-connection/savepoint approach would require
overriding `get_db` to nest every request in the test's own transaction, which this suite
intentionally avoids so API tests exercise the exact same session lifecycle as production).

IMPORTANT: the environment variables below MUST be set before any `app.*` module is imported
anywhere (including by other test modules), because `app.core.config.Settings` reads them at
*import* time via a module-level `settings = get_settings()` singleton. conftest.py is loaded
by pytest before it collects/imports test modules, so setting them here at module level (not
inside a fixture function) guarantees the ordering.
"""

import os
from urllib.parse import urlsplit, urlunsplit

# ---------------------------------------------------------------------------------------
# 1. Point the app at a dedicated test database + a dedicated Redis logical DB, BEFORE any
#    `app.*` import anywhere. We read the real backend/.env-configured DATABASE_URL first (via
#    a throwaway pydantic-settings load is overkill — just parse .env directly with dotenv-like
#    minimal parsing) so this works whether or not DATABASE_URL is already exported.
# ---------------------------------------------------------------------------------------


def _load_dotenv_value(key: str) -> str | None:
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    if not os.path.exists(env_path):
        return None
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            if k.strip() == key:
                return v.strip()
    return None


_base_database_url = (
    os.environ.get("DATABASE_URL")
    or _load_dotenv_value("DATABASE_URL")
    or "postgresql+psycopg://appuser:apppass@localhost:5432/aipcc"
)

# Swap whatever database name is configured for a dedicated "aipcc_test" database on the same
# server/credentials — never run tests against the real "aipcc" dev DB (which holds the demo
# seed data a concurrent session may be relying on).
_parts = urlsplit(_base_database_url)
TEST_DB_NAME = "aipcc_test"
_test_path = f"/{TEST_DB_NAME}"
TEST_DATABASE_URL = urlunsplit((_parts.scheme, _parts.netloc, _test_path, "", ""))

# Admin connection (to the default "postgres" maintenance DB) used only to create/drop the
# aipcc_test database itself — psycopg (not psycopg+sqlalchemy dialect prefix) needs a plain URL.
_ADMIN_DATABASE_URL = urlunsplit((_parts.scheme.replace("+psycopg", ""), _parts.netloc, "/postgres", "", ""))

os.environ["DATABASE_URL"] = TEST_DATABASE_URL
# Redis logical DB 15 keeps AIRouter cache/rate-limit keys used by tests fully isolated from
# whatever a running dev server (or the seeded demo org) is doing against DB 0.
os.environ["REDIS_URL"] = os.environ.get("TEST_REDIS_URL", "redis://localhost:6379/15")
os.environ.setdefault("ENVIRONMENT", "test")
# JWT_SECRET / other settings fall back to backend/.env (or its own defaults) — no need to
# override those for tests, only the two that must never touch shared/dev state.

import psycopg  # noqa: E402
import pytest  # noqa: E402
import redis as redis_lib  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config as AlembicConfig  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

# ---------------------------------------------------------------------------------------
# 2. Create the test database (if missing) and run real Alembic migrations against it, once
#    per test session — this is the "create/migrate/tear down schema per test session" choice
#    documented above.
# ---------------------------------------------------------------------------------------

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ensure_test_database_exists() -> None:
    conn = psycopg.connect(_ADMIN_DATABASE_URL, autocommit=True)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (TEST_DB_NAME,))
            if cur.fetchone() is None:
                cur.execute(f'CREATE DATABASE "{TEST_DB_NAME}"')
    finally:
        conn.close()


def _run_migrations() -> None:
    alembic_cfg = AlembicConfig(os.path.join(_BACKEND_DIR, "alembic.ini"))
    alembic_cfg.set_main_option("script_location", os.path.join(_BACKEND_DIR, "alembic"))
    # app.core.config.settings.DATABASE_URL (read by alembic/env.py) already resolves to
    # TEST_DATABASE_URL because we set the DATABASE_URL env var above before any app import.
    command.upgrade(alembic_cfg, "head")


_ensure_test_database_exists()
_run_migrations()

# ---------------------------------------------------------------------------------------
# 3. Now it's safe to import the app.
# ---------------------------------------------------------------------------------------

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402

# Tables that are seeded once by the Phase 5 migration and never mutated by app code at
# runtime (the RBAC permission catalog) — never truncate these between tests.
_STATIC_TABLES = {"permissions", "role_permissions"}
_ALL_TABLE_NAMES = [t.name for t in Base.metadata.sorted_tables]
_TRUNCATE_TABLE_NAMES = [name for name in _ALL_TABLE_NAMES if name not in _STATIC_TABLES]


@pytest.fixture(autouse=True)
def _clean_database():
    """Function-scoped, autouse: truncate every non-static app table before each test so
    tests never see another test's rows (multi-tenancy tests in particular rely on a clean
    slate to assert cross-org isolation unambiguously)."""
    with engine.begin() as conn:
        if _TRUNCATE_TABLE_NAMES:
            table_list = ", ".join(f'"{name}"' for name in _TRUNCATE_TABLE_NAMES)
            conn.execute(text(f"TRUNCATE TABLE {table_list} RESTART IDENTITY CASCADE"))
    yield


@pytest.fixture(autouse=True)
def _clean_redis():
    """Function-scoped, autouse: flush the dedicated test Redis logical DB before each test
    so AIRouter's cache/rate-limiter state never leaks between tests."""
    client = redis_lib.Redis.from_url(os.environ["REDIS_URL"], decode_responses=True)
    try:
        client.flushdb()
    except redis_lib.RedisError:
        pytest.skip("Redis is not reachable at REDIS_URL — required for this test suite")
    yield
    try:
        client.flushdb()
    except redis_lib.RedisError:
        pass


@pytest.fixture()
def db():
    """A raw SQLAlchemy session against the test database, for direct setup/assertions that
    don't go through the API (e.g. seeding rows, or checking what a router call persisted)."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client():
    """FastAPI TestClient against the real app (real routers, real DB session lifecycle via
    app.core.database.get_db) — no dependency overrides for the DB, since DATABASE_URL itself
    already points at the isolated aipcc_test database. AI-router overrides, when needed, are
    applied by individual tests/fixtures via `app.dependency_overrides`."""
    with TestClient(fastapi_app) as c:
        yield c
    fastapi_app.dependency_overrides.clear()


# ---------------------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------------------


def register_org(client: TestClient, *, org_name: str, email: str, password: str = "TestPass123!", full_name: str = "Test User") -> dict:
    resp = client.post(
        "/api/v1/auth/register",
        json={
            "organization_name": org_name,
            "email": email,
            "password": password,
            "full_name": full_name,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def org_a(client):
    """A freshly registered organization + ADMIN user + bearer token."""
    return register_org(client, org_name="Northwind Consulting", email="admin@northwind.io")


@pytest.fixture()
def org_b(client):
    """A second, independent organization — used by multi-tenancy isolation tests."""
    return register_org(client, org_name="Contoso Analytics", email="admin@contoso.io")


@pytest.fixture()
def headers_a(org_a):
    return auth_header(org_a["access_token"])


@pytest.fixture()
def headers_b(org_b):
    return auth_header(org_b["access_token"])


def make_token(*, organization_id, role: str = "ADMIN", read_only: bool = False, user_id: str | None = None) -> str:
    """Build a JWT directly (bypassing register/login) for tests that need a specific
    role/read_only combination that the register flow can't produce on its own (e.g. a
    demo-scoped read-only token, or a MEMBER/VIEWER role)."""
    return create_access_token(
        user_id=user_id or "00000000-0000-0000-0000-000000000000",
        organization_id=organization_id,
        role=role,
        read_only=read_only,
    )
