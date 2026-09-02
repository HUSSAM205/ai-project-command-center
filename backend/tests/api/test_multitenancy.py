"""Multi-tenancy isolation tests — the core guarantee documented in docs/ARCHITECTURE.md:
"cross-tenant reads are a bug, not a feature, from day one". Two independently-registered
organizations (org_a / org_b fixtures) must never be able to see or modify each other's data
through ANY endpoint, keyed only by the organization_id baked into each JWT."""

import pytest


def _create_project(client, headers, **overrides):
    payload = {"name": "Org A Secret Project", "budget": "100000", "actual_cost": "0", "progress": 0}
    payload.update(overrides)
    resp = client.post("/api/v1/projects", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_task(client, headers, project_id, **overrides):
    payload = {"title": "Org A Secret Task"}
    payload.update(overrides)
    resp = client.post(f"/api/v1/projects/{project_id}/tasks", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_risk(client, headers, project_id, **overrides):
    payload = {"title": "Org A Secret Risk", "category": "TECHNICAL", "probability": 3, "impact": 3}
    payload.update(overrides)
    resp = client.post(f"/api/v1/projects/{project_id}/risks", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_resource(client, headers, **overrides):
    payload = {"name": "Org A Secret Resource", "hourly_cost": "50", "capacity_hours_per_week": "40"}
    payload.update(overrides)
    resp = client.post("/api/v1/resources", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


class TestProjectIsolation:
    def test_org_b_cannot_read_org_a_project(self, client, headers_a, headers_b):
        project = _create_project(client, headers_a)
        resp = client.get(f"/api/v1/projects/{project['id']}", headers=headers_b)
        assert resp.status_code == 404

    def test_org_b_cannot_update_org_a_project(self, client, headers_a, headers_b):
        project = _create_project(client, headers_a)
        resp = client.patch(
            f"/api/v1/projects/{project['id']}", json={"name": "Hijacked"}, headers=headers_b
        )
        assert resp.status_code == 404

    def test_org_b_cannot_delete_org_a_project(self, client, headers_a, headers_b):
        project = _create_project(client, headers_a)
        resp = client.delete(f"/api/v1/projects/{project['id']}", headers=headers_b)
        assert resp.status_code == 404
        # ...and it's genuinely still there for org A.
        resp = client.get(f"/api/v1/projects/{project['id']}", headers=headers_a)
        assert resp.status_code == 200

    def test_org_b_project_list_never_contains_org_a_projects(self, client, headers_a, headers_b):
        _create_project(client, headers_a, name="Org A Only")
        _create_project(client, headers_b, name="Org B Only")
        resp = client.get("/api/v1/projects", headers=headers_b)
        names = {p["name"] for p in resp.json()}
        assert names == {"Org B Only"}

    def test_org_b_cannot_read_org_a_health_or_forecast(self, client, headers_a, headers_b):
        project = _create_project(client, headers_a)
        assert client.get(f"/api/v1/projects/{project['id']}/health", headers=headers_b).status_code == 404
        assert client.get(f"/api/v1/projects/{project['id']}/forecast", headers=headers_b).status_code == 404


class TestTaskIsolation:
    def test_org_b_cannot_read_org_a_task(self, client, headers_a, headers_b):
        project = _create_project(client, headers_a)
        task = _create_task(client, headers_a, project["id"])
        resp = client.get(f"/api/v1/tasks/{task['id']}", headers=headers_b)
        assert resp.status_code == 404

    def test_org_b_cannot_update_org_a_task(self, client, headers_a, headers_b):
        project = _create_project(client, headers_a)
        task = _create_task(client, headers_a, project["id"])
        resp = client.patch(f"/api/v1/tasks/{task['id']}", json={"status": "DONE"}, headers=headers_b)
        assert resp.status_code == 404

    def test_org_b_cannot_list_tasks_via_org_a_project_id(self, client, headers_a, headers_b):
        project = _create_project(client, headers_a)
        _create_task(client, headers_a, project["id"])
        resp = client.get(f"/api/v1/projects/{project['id']}/tasks", headers=headers_b)
        assert resp.status_code == 404

    def test_org_b_cannot_create_task_under_org_a_project(self, client, headers_a, headers_b):
        project = _create_project(client, headers_a)
        resp = client.post(
            f"/api/v1/projects/{project['id']}/tasks", json={"title": "Injected"}, headers=headers_b
        )
        assert resp.status_code == 404


class TestRiskIsolation:
    def test_org_b_cannot_read_org_a_risks(self, client, headers_a, headers_b):
        project = _create_project(client, headers_a)
        _create_risk(client, headers_a, project["id"])
        resp = client.get(f"/api/v1/projects/{project['id']}/risks", headers=headers_b)
        assert resp.status_code == 404

    def test_org_b_cannot_update_org_a_risk(self, client, headers_a, headers_b):
        project = _create_project(client, headers_a)
        risk = _create_risk(client, headers_a, project["id"])
        resp = client.patch(f"/api/v1/risks/{risk['id']}", json={"status": "CLOSED"}, headers=headers_b)
        assert resp.status_code == 404

    def test_org_b_cannot_delete_org_a_risk(self, client, headers_a, headers_b):
        project = _create_project(client, headers_a)
        risk = _create_risk(client, headers_a, project["id"])
        resp = client.delete(f"/api/v1/risks/{risk['id']}", headers=headers_b)
        assert resp.status_code == 404


class TestBudgetIsolation:
    def test_org_b_cannot_read_org_a_budget(self, client, headers_a, headers_b):
        project = _create_project(client, headers_a)
        resp = client.get(f"/api/v1/projects/{project['id']}/budget", headers=headers_b)
        assert resp.status_code == 404

    def test_org_b_cannot_post_transaction_to_org_a_project(self, client, headers_a, headers_b):
        project = _create_project(client, headers_a)
        resp = client.post(
            f"/api/v1/projects/{project['id']}/budget/transactions",
            json={"amount": "999999", "category": "Sabotage"},
            headers=headers_b,
        )
        assert resp.status_code == 404
        # actual_cost on org A's project must be untouched.
        resp = client.get(f"/api/v1/projects/{project['id']}/budget", headers=headers_a)
        assert resp.json()["actual_cost"] == pytest.approx(0.0)


class TestResourceIsolation:
    def test_org_b_resource_list_never_contains_org_a_resources(self, client, headers_a, headers_b):
        _create_resource(client, headers_a, name="Org A Engineer")
        _create_resource(client, headers_b, name="Org B Engineer")
        resp = client.get("/api/v1/resources", headers=headers_b)
        names = {r["name"] for r in resp.json()}
        assert names == {"Org B Engineer"}

    def test_org_b_cannot_update_org_a_resource(self, client, headers_a, headers_b):
        resource = _create_resource(client, headers_a)
        resp = client.patch(
            f"/api/v1/resources/{resource['id']}", json={"name": "Hijacked"}, headers=headers_b
        )
        assert resp.status_code == 404

    def test_suggest_assignees_never_recommends_a_resource_from_another_org(self, client, headers_a, headers_b):
        project_b = _create_project(client, headers_b, name="Org B Project")
        task_b = _create_task(client, headers_b, project_b["id"], title="Org B Task", required_skills=["Python"])
        _create_resource(client, headers_a, name="Org A Python Expert", skills=["Python"])
        _create_resource(client, headers_b, name="Org B Python Expert", skills=["Python"])

        resp = client.post(f"/api/v1/tasks/{task_b['id']}/suggest-assignees", json={}, headers=headers_b)
        assert resp.status_code == 200
        names = {c["resource_name"] for c in resp.json()}
        assert names == {"Org B Python Expert"}


class TestUserIdentityIsolation:
    def test_me_never_leaks_another_orgs_user(self, client, org_a, org_b, headers_a, headers_b):
        me_a = client.get("/api/v1/auth/me", headers=headers_a).json()
        me_b = client.get("/api/v1/auth/me", headers=headers_b).json()
        assert me_a["organization_id"] == org_a["user"]["organization_id"]
        assert me_b["organization_id"] == org_b["user"]["organization_id"]
        assert me_a["organization_id"] != me_b["organization_id"]
