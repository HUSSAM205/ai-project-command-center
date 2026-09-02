"""RBAC tests: app/core/deps.py::require_permission ("admin.access") must gate every
/admin/* endpoint EXCEPT the two read-only telemetry routes below, backed by the real
`permissions`/`role_permissions` tables seeded in the Phase 5 migration
(alembic/versions/c3d4e5f6a7b8_rbac_audit_feedback.py), not a hardcoded role check — per that
migration's grants: ADMIN has admin.access, MANAGER/MEMBER/VIEWER do not. These tests hit the
real seeded catalog (never truncated between tests — see tests/conftest.py's `_STATIC_TABLES`).

ai-providers/ai-usage are deliberately gated by get_current_principal only (see
app/api/admin.py) rather than require_admin: they're aggregated, org-scoped, read-only
diagnostic data with no write surface, so any authenticated session — including a read-only
demo token — can view them. TestTelemetryEndpointsAreViewerAccessible below covers that.
"""

import uuid

import pytest

from tests.conftest import auth_header, make_token

ADMIN_ENDPOINTS = [
    ("GET", "/api/v1/admin/users"),
    ("GET", "/api/v1/admin/organizations"),
    ("GET", "/api/v1/admin/audit-logs"),
    ("GET", "/api/v1/admin/feedback"),
]

TELEMETRY_ENDPOINTS = [
    ("GET", "/api/v1/admin/ai-providers"),
    ("GET", "/api/v1/admin/ai-usage"),
]


def _headers_for_role(org_a, role: str) -> dict:
    org_id = uuid.UUID(org_a["user"]["organization_id"])
    token = make_token(organization_id=org_id, role=role, read_only=False)
    return auth_header(token)


class TestNonAdminRolesAreRejected:
    @pytest.mark.parametrize("role", ["VIEWER", "MEMBER", "MANAGER"])
    @pytest.mark.parametrize("method,path", ADMIN_ENDPOINTS)
    def test_non_admin_role_gets_403(self, client, org_a, role, method, path):
        headers = _headers_for_role(org_a, role)
        resp = client.request(method, path, headers=headers)
        assert resp.status_code == 403, f"{role} {method} {path} -> {resp.status_code}"


class TestAdminRoleIsAllowed:
    @pytest.mark.parametrize("method,path", ADMIN_ENDPOINTS)
    def test_admin_role_gets_200(self, client, org_a, method, path):
        headers = _headers_for_role(org_a, "ADMIN")
        resp = client.request(method, path, headers=headers)
        assert resp.status_code == 200, f"ADMIN {method} {path} -> {resp.status_code}: {resp.text}"


class TestTelemetryEndpointsAreViewerAccessible:
    """ai-providers/ai-usage intentionally sit outside admin.access — every real role, plus a
    genuine read-only demo token, must get 200. An unauthenticated request must still be
    rejected (401), since this is "any signed-in session", not "public"."""

    @pytest.mark.parametrize("role", ["VIEWER", "MEMBER", "MANAGER", "ADMIN"])
    @pytest.mark.parametrize("method,path", TELEMETRY_ENDPOINTS)
    def test_every_role_gets_200(self, client, org_a, role, method, path):
        headers = _headers_for_role(org_a, role)
        resp = client.request(method, path, headers=headers)
        assert resp.status_code == 200, f"{role} {method} {path} -> {resp.status_code}: {resp.text}"

    @pytest.mark.parametrize("method,path", TELEMETRY_ENDPOINTS)
    def test_read_only_demo_token_gets_200(self, client, org_a, method, path):
        org_id = uuid.UUID(org_a["user"]["organization_id"])
        token = make_token(organization_id=org_id, role="VIEWER", read_only=True)
        resp = client.request(method, path, headers=auth_header(token))
        assert resp.status_code == 200, f"demo {method} {path} -> {resp.status_code}: {resp.text}"

    @pytest.mark.parametrize("method,path", TELEMETRY_ENDPOINTS)
    def test_unauthenticated_gets_401(self, client, method, path):
        resp = client.request(method, path)
        assert resp.status_code == 401, f"{method} {path} -> {resp.status_code}"


class TestAdminEndpointsAreOrgScoped:
    def test_admin_user_list_is_scoped_to_own_org(self, client, org_a, org_b):
        # AdminUserOut deliberately doesn't even expose organization_id (the endpoint itself
        # is already org-scoped by construction — see app/schemas/admin.py) — assert on email
        # identity instead: org A's admin listing must contain its own admin and never org B's.
        headers_a = _headers_for_role(org_a, "ADMIN")
        resp = client.get("/api/v1/admin/users", headers=headers_a)
        assert resp.status_code == 200
        emails_seen = {u["email"] for u in resp.json()}
        assert org_a["user"]["email"] in emails_seen
        assert org_b["user"]["email"] not in emails_seen

    def test_admin_own_organization_endpoint_never_returns_another_org(self, client, org_a, org_b):
        headers_a = _headers_for_role(org_a, "ADMIN")
        resp = client.get("/api/v1/admin/organizations", headers=headers_a)
        assert resp.status_code == 200
        assert resp.json()["id"] == org_a["user"]["organization_id"]


class TestRoleGrantsMatchTheSeededCatalog:
    """Sanity-checks the seeded catalog itself (alembic/versions/c3d4e5f6a7b8...) matches what
    the code comments claim: ADMIN/MANAGER/MEMBER/VIEWER grants for admin.access."""

    def test_only_admin_role_has_admin_access_permission(self, db):
        from sqlalchemy import select

        from app.models.role import Permission, RolePermission

        rows = db.execute(
            select(RolePermission.role)
            .join(Permission, Permission.id == RolePermission.permission_id)
            .where(Permission.key == "admin.access")
        ).scalars().all()
        assert set(rows) == {"ADMIN"}
