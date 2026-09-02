"""Integration tests for /api/v1/projects/{id}/risks and /api/v1/risks/{id}."""


def _create_project(client, headers, **overrides):
    payload = {"name": "Risk Test Project", "budget": "100000", "actual_cost": "0", "progress": 0}
    payload.update(overrides)
    resp = client.post("/api/v1/projects", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_risk(client, headers, project_id, **overrides):
    payload = {
        "title": "Vendor delay",
        "category": "DEPENDENCY",
        "probability": 3,
        "impact": 4,
        "status": "OPEN",
    }
    payload.update(overrides)
    resp = client.post(f"/api/v1/projects/{project_id}/risks", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


class TestRiskCRUD:
    def test_create_risk_computes_score_and_severity(self, client, headers_a):
        project = _create_project(client, headers_a)
        risk = _create_risk(client, headers_a, project["id"], probability=5, impact=4)
        assert risk["score"] == 20
        assert risk["severity"] == "CRITICAL"  # 17-25 -> CRITICAL

    def test_severity_thresholds(self, client, headers_a):
        project = _create_project(client, headers_a)
        cases = [
            (1, 1, "LOW"),      # score 1
            (2, 2, "LOW"),      # score 4
            (2, 3, "MEDIUM"),   # score 6
            (3, 3, "MEDIUM"),   # score 9
            (2, 5, "HIGH"),     # score 10
            (4, 4, "HIGH"),     # score 16
            (4, 5, "CRITICAL"), # score 20
            (5, 5, "CRITICAL"), # score 25
        ]
        for probability, impact, expected_severity in cases:
            risk = _create_risk(client, headers_a, project["id"], probability=probability, impact=impact)
            assert risk["severity"] == expected_severity, f"prob={probability} impact={impact}"

    def test_list_risks_for_project(self, client, headers_a):
        project = _create_project(client, headers_a)
        _create_risk(client, headers_a, project["id"], title="Risk A")
        _create_risk(client, headers_a, project["id"], title="Risk B")
        resp = client.get(f"/api/v1/projects/{project['id']}/risks", headers=headers_a)
        assert resp.status_code == 200
        assert {r["title"] for r in resp.json()} == {"Risk A", "Risk B"}

    def test_update_risk(self, client, headers_a):
        project = _create_project(client, headers_a)
        risk = _create_risk(client, headers_a, project["id"])
        resp = client.patch(f"/api/v1/risks/{risk['id']}", json={"status": "MITIGATING"}, headers=headers_a)
        assert resp.status_code == 200
        assert resp.json()["status"] == "MITIGATING"

    def test_delete_risk(self, client, headers_a):
        project = _create_project(client, headers_a)
        risk = _create_risk(client, headers_a, project["id"])
        resp = client.delete(f"/api/v1/risks/{risk['id']}", headers=headers_a)
        assert resp.status_code == 204

    def test_create_risk_rejects_out_of_range_probability(self, client, headers_a):
        project = _create_project(client, headers_a)
        resp = client.post(
            f"/api/v1/projects/{project['id']}/risks",
            json={"title": "Bad Risk", "category": "TECHNICAL", "probability": 9, "impact": 3},
            headers=headers_a,
        )
        assert resp.status_code == 422

    def test_create_risk_on_nonexistent_project_returns_404(self, client, headers_a):
        resp = client.post(
            "/api/v1/projects/00000000-0000-0000-0000-000000000000/risks",
            json={"title": "Orphan", "category": "TECHNICAL", "probability": 1, "impact": 1},
            headers=headers_a,
        )
        assert resp.status_code == 404
