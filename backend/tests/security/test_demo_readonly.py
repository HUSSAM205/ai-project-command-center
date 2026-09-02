"""Security tests: demo-scoped / read-only tokens must be rejected (403) on every mutating
endpoint category, per app/core/deps.py::require_write_access ("Demo-scoped tokens carry
read_only=true and must never be able to mutate data, including the demo organization's own
seeded data."). Representative categories per the Phase 7 spec: projects, tasks, risks, budget
transactions, document upload, consulting business cases — plus a couple more (resources,
milestones) for good measure, and a sanity check that reads still work.
"""

import uuid

from tests.conftest import auth_header, make_token


def _admin_headers(org_a):
    return auth_header(org_a["access_token"])


def _demo_headers(org_a):
    org_id = org_a["user"]["organization_id"]
    # Real demo sessions carry sub="demo" (see app/api/demo.py + app/core/security.py's
    # `user_id=None` -> "demo" sentinel), not a UUID — mirror that exactly here rather than a
    # UUID-shaped placeholder, which would insert as a real (nonexistent) user_id FK on writes
    # that are allowed for demo tokens (e.g. feedback) and blow up with an unrelated FK error.
    token = make_token(organization_id=uuid.UUID(org_id), role="VIEWER", read_only=True, user_id="demo")
    return auth_header(token)


def _create_project(client, headers):
    resp = client.post(
        "/api/v1/projects",
        json={"name": "Seed Project", "budget": "10000", "actual_cost": "0", "progress": 0},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_task(client, headers, project_id):
    resp = client.post(f"/api/v1/projects/{project_id}/tasks", json={"title": "Seed Task"}, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_risk(client, headers, project_id):
    resp = client.post(
        f"/api/v1/projects/{project_id}/risks",
        json={"title": "Seed Risk", "category": "TECHNICAL", "probability": 2, "impact": 2},
        headers=headers,
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


class TestDemoTokenRejectedOnMutations:
    def test_demo_token_cannot_create_project(self, client, org_a):
        resp = client.post(
            "/api/v1/projects", json={"name": "Hacked Project"}, headers=_demo_headers(org_a)
        )
        assert resp.status_code == 403

    def test_demo_token_cannot_update_project(self, client, org_a):
        project = _create_project(client, _admin_headers(org_a))
        resp = client.patch(
            f"/api/v1/projects/{project['id']}", json={"name": "Hacked"}, headers=_demo_headers(org_a)
        )
        assert resp.status_code == 403

    def test_demo_token_cannot_delete_project(self, client, org_a):
        project = _create_project(client, _admin_headers(org_a))
        resp = client.delete(f"/api/v1/projects/{project['id']}", headers=_demo_headers(org_a))
        assert resp.status_code == 403

    def test_demo_token_cannot_create_task(self, client, org_a):
        project = _create_project(client, _admin_headers(org_a))
        resp = client.post(
            f"/api/v1/projects/{project['id']}/tasks", json={"title": "Hacked Task"}, headers=_demo_headers(org_a)
        )
        assert resp.status_code == 403

    def test_demo_token_cannot_update_task(self, client, org_a):
        project = _create_project(client, _admin_headers(org_a))
        task = _create_task(client, _admin_headers(org_a), project["id"])
        resp = client.patch(f"/api/v1/tasks/{task['id']}", json={"status": "DONE"}, headers=_demo_headers(org_a))
        assert resp.status_code == 403

    def test_demo_token_cannot_create_risk(self, client, org_a):
        project = _create_project(client, _admin_headers(org_a))
        resp = client.post(
            f"/api/v1/projects/{project['id']}/risks",
            json={"title": "Hacked Risk", "category": "TECHNICAL", "probability": 1, "impact": 1},
            headers=_demo_headers(org_a),
        )
        assert resp.status_code == 403

    def test_demo_token_cannot_update_risk(self, client, org_a):
        project = _create_project(client, _admin_headers(org_a))
        risk = _create_risk(client, _admin_headers(org_a), project["id"])
        resp = client.patch(f"/api/v1/risks/{risk['id']}", json={"status": "CLOSED"}, headers=_demo_headers(org_a))
        assert resp.status_code == 403

    def test_demo_token_cannot_create_budget_transaction(self, client, org_a):
        project = _create_project(client, _admin_headers(org_a))
        resp = client.post(
            f"/api/v1/projects/{project['id']}/budget/transactions",
            json={"amount": "500", "category": "Misc"},
            headers=_demo_headers(org_a),
        )
        assert resp.status_code == 403

    def test_demo_token_cannot_upload_document(self, client, org_a):
        files = {"file": ("test.txt", b"hello world", "text/plain")}
        resp = client.post("/api/v1/documents", files=files, headers=_demo_headers(org_a))
        assert resp.status_code == 403

    def test_demo_token_cannot_create_consulting_business_case(self, client, org_a):
        resp = client.post(
            "/api/v1/consulting/business-cases",
            json={
                "name": "Hacked Case",
                "business_problem": "x",
                "current_state": "x",
                "desired_state": "x",
                "objectives": "x",
            },
            headers=_demo_headers(org_a),
        )
        assert resp.status_code == 403

    def test_demo_token_cannot_create_resource(self, client, org_a):
        resp = client.post(
            "/api/v1/resources", json={"name": "Hacked Resource"}, headers=_demo_headers(org_a)
        )
        assert resp.status_code == 403

    def test_demo_token_cannot_create_milestone(self, client, org_a):
        project = _create_project(client, _admin_headers(org_a))
        resp = client.post(
            f"/api/v1/projects/{project['id']}/milestones",
            json={"name": "Hacked Milestone"},
            headers=_demo_headers(org_a),
        )
        assert resp.status_code == 403


class TestDemoTokenReadsStillWork:
    def test_demo_token_can_list_projects(self, client, org_a):
        _create_project(client, _admin_headers(org_a))
        resp = client.get("/api/v1/projects", headers=_demo_headers(org_a))
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_demo_token_can_read_project_health(self, client, org_a):
        project = _create_project(client, _admin_headers(org_a))
        resp = client.get(f"/api/v1/projects/{project['id']}/health", headers=_demo_headers(org_a))
        assert resp.status_code == 200

    def test_demo_token_can_submit_feedback(self, client, org_a):
        # Deliberately NOT gated by require_write_access (see app/api/feedback.py) — any
        # authenticated caller, including a read-only demo session, may leave feedback.
        resp = client.post(
            "/api/v1/feedback", json={"message": "Great demo!"}, headers=_demo_headers(org_a)
        )
        assert resp.status_code == 201
