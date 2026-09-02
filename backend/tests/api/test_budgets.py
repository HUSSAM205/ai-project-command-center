"""Integration tests for /api/v1/projects/{id}/budget and .../budget/transactions."""

import pytest


def _create_project(client, headers, **overrides):
    payload = {"name": "Budget Test Project", "budget": "100000", "actual_cost": "0", "progress": 0}
    payload.update(overrides)
    resp = client.post("/api/v1/projects", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


class TestBudget:
    def test_get_budget_before_any_transactions(self, client, headers_a):
        project = _create_project(client, headers_a, budget="100000", actual_cost="0")
        resp = client.get(f"/api/v1/projects/{project['id']}/budget", headers=headers_a)
        assert resp.status_code == 200
        body = resp.json()
        assert body["budget"]["initial_budget"] == pytest.approx(100_000.0)
        assert body["actual_cost"] == pytest.approx(0.0)
        assert body["remaining"] == pytest.approx(100_000.0)
        assert body["transactions"] == []

    def test_create_transaction_updates_actual_cost_and_remaining(self, client, headers_a):
        project = _create_project(client, headers_a, budget="100000", actual_cost="0")
        resp = client.post(
            f"/api/v1/projects/{project['id']}/budget/transactions",
            json={"description": "Cloud spend", "amount": "15000", "category": "Infrastructure", "date": "2026-03-01"},
            headers=headers_a,
        )
        assert resp.status_code == 201, resp.text

        resp = client.get(f"/api/v1/projects/{project['id']}/budget", headers=headers_a)
        body = resp.json()
        assert body["actual_cost"] == pytest.approx(15_000.0)
        assert body["remaining"] == pytest.approx(85_000.0)
        assert body["spent_percent"] == pytest.approx(15.0)
        assert len(body["transactions"]) == 1
        assert body["transactions"][0]["description"] == "Cloud spend"

    def test_multiple_transactions_accumulate(self, client, headers_a):
        project = _create_project(client, headers_a, budget="100000", actual_cost="0")
        for amount in ("10000", "20000", "5000"):
            resp = client.post(
                f"/api/v1/projects/{project['id']}/budget/transactions",
                json={"amount": amount, "category": "Misc"},
                headers=headers_a,
            )
            assert resp.status_code == 201

        resp = client.get(f"/api/v1/projects/{project['id']}/budget", headers=headers_a)
        body = resp.json()
        assert body["actual_cost"] == pytest.approx(35_000.0)
        assert len(body["transactions"]) == 3

    def test_get_budget_for_nonexistent_project_returns_404(self, client, headers_a):
        resp = client.get(
            "/api/v1/projects/00000000-0000-0000-0000-000000000000/budget", headers=headers_a
        )
        assert resp.status_code == 404
