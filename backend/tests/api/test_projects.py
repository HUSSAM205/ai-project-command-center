"""Integration tests for /api/v1/projects/* — CRUD plus the /health and /forecast derived
endpoints, against a real TestClient + the aipcc_test database."""

import pytest


def _create_project(client, headers, **overrides):
    payload = {
        "name": "Test Project",
        "description": "A project for testing",
        "client": "Acme",
        "status": "ACTIVE",
        "priority": "HIGH",
        "start_date": "2026-01-01",
        "end_date": "2026-12-31",
        "budget": "100000",
        "actual_cost": "40000",
        "progress": 40,
    }
    payload.update(overrides)
    resp = client.post("/api/v1/projects", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


class TestProjectCRUD:
    def test_create_and_get_project(self, client, headers_a):
        project = _create_project(client, headers_a, name="Cloud Migration")
        resp = client.get(f"/api/v1/projects/{project['id']}", headers=headers_a)
        assert resp.status_code == 200
        assert resp.json()["name"] == "Cloud Migration"

    def test_create_project_requires_auth(self, client):
        resp = client.post("/api/v1/projects", json={"name": "No Auth Project"})
        assert resp.status_code == 401

    def test_list_projects_returns_created_projects(self, client, headers_a):
        _create_project(client, headers_a, name="Project One")
        _create_project(client, headers_a, name="Project Two")
        resp = client.get("/api/v1/projects", headers=headers_a)
        assert resp.status_code == 200
        names = {p["name"] for p in resp.json()}
        assert {"Project One", "Project Two"} <= names

    def test_update_project_patches_only_given_fields(self, client, headers_a):
        project = _create_project(client, headers_a, name="Original Name", progress=10)
        resp = client.patch(
            f"/api/v1/projects/{project['id']}", json={"progress": 75}, headers=headers_a
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["progress"] == 75
        assert body["name"] == "Original Name"  # untouched

    def test_delete_project_removes_it(self, client, headers_a):
        project = _create_project(client, headers_a)
        resp = client.delete(f"/api/v1/projects/{project['id']}", headers=headers_a)
        assert resp.status_code == 204
        resp = client.get(f"/api/v1/projects/{project['id']}", headers=headers_a)
        assert resp.status_code == 404

    def test_get_nonexistent_project_returns_404(self, client, headers_a):
        resp = client.get(
            "/api/v1/projects/00000000-0000-0000-0000-000000000000", headers=headers_a
        )
        assert resp.status_code == 404

    def test_get_project_with_malformed_id_returns_422(self, client, headers_a):
        resp = client.get("/api/v1/projects/not-a-uuid", headers=headers_a)
        assert resp.status_code == 422


class TestProjectHealthAndForecast:
    def test_health_endpoint_returns_breakdown(self, client, headers_a):
        project = _create_project(
            client,
            headers_a,
            start_date="2026-01-01",
            end_date="2026-12-31",
            budget="100000",
            actual_cost="50000",
            progress=50,
        )
        resp = client.get(f"/api/v1/projects/{project['id']}/health", headers=headers_a)
        assert resp.status_code == 200
        body = resp.json()
        assert "health_score" in body
        assert 0 <= body["health_score"] <= 100
        assert set(body["breakdown"].keys()) == {
            "schedule_penalty",
            "budget_penalty",
            "task_penalty",
            "risk_penalty",
            "resource_penalty",
            "dependency_penalty",
            "total_penalty",
        }

    def test_forecast_endpoint_returns_evm_baseline(self, client, headers_a):
        project = _create_project(client, headers_a, budget="500000", actual_cost="330000", progress=68)
        resp = client.get(f"/api/v1/projects/{project['id']}/forecast", headers=headers_a)
        assert resp.status_code == 200
        body = resp.json()
        assert body["method"] == "baseline estimate (EVM: EAC = BAC / CPI)"
        assert body["forecasted_final_cost"] == pytest.approx(485_294.12, abs=1.0)
