"""Integration tests for /api/v1/auth/* against a real TestClient + the aipcc_test database."""

from tests.conftest import auth_header, register_org


class TestRegister:
    def test_register_returns_token_and_user(self, client):
        data = register_org(client, org_name="Acme Corp", email="owner@acme.io")
        assert data["access_token"]
        assert data["user"]["email"] == "owner@acme.io"
        assert data["user"]["role"] == "ADMIN"
        assert data["token_type"] == "bearer"

    def test_registering_same_org_name_twice_creates_two_distinct_orgs(self, client):
        first = register_org(client, org_name="Acme Corp", email="a@acme.io")
        second = register_org(client, org_name="Acme Corp", email="b@acme.io")
        assert first["user"]["organization_id"] != second["user"]["organization_id"]

    def test_register_rejects_short_password(self, client):
        resp = client.post(
            "/api/v1/auth/register",
            json={
                "organization_name": "Weak Pw Co",
                "email": "weak@example.com",
                "password": "short",
                "full_name": "Weak Pw",
            },
        )
        assert resp.status_code == 422

    def test_register_rejects_invalid_email(self, client):
        resp = client.post(
            "/api/v1/auth/register",
            json={
                "organization_name": "Bad Email Co",
                "email": "not-an-email",
                "password": "TestPass123!",
                "full_name": "Bad Email",
            },
        )
        assert resp.status_code == 422


class TestLogin:
    def test_login_with_correct_credentials_succeeds(self, client):
        register_org(client, org_name="Login Co", email="login@example.com", password="CorrectPass1!")
        resp = client.post(
            "/api/v1/auth/login", json={"email": "login@example.com", "password": "CorrectPass1!"}
        )
        assert resp.status_code == 200
        assert resp.json()["access_token"]

    def test_login_with_wrong_password_returns_401(self, client):
        register_org(client, org_name="Login Co 2", email="login2@example.com", password="CorrectPass1!")
        resp = client.post(
            "/api/v1/auth/login", json={"email": "login2@example.com", "password": "WrongPass1!"}
        )
        assert resp.status_code == 401

    def test_login_with_unknown_email_returns_401(self, client):
        resp = client.post(
            "/api/v1/auth/login", json={"email": "nobody@example.com", "password": "WhateverPass1!"}
        )
        assert resp.status_code == 401

    def test_email_is_globally_unique_across_organizations(self, client):
        """Regression test for a real bug this suite originally found: `User.email` used to be
        unique only *per organization*, but `login()` looks the user up with
        `select(User).where(User.email == payload.email)` — no organization filter, since login
        has no org-selection step — so a shared email across two orgs made login resolve to
        whichever row Postgres returned first, spuriously rejecting the other account's
        genuinely correct password. Fixed by making email globally unique (see
        app/models/user.py and the `email globally unique` migration): the second registration
        with a duplicate email must now be rejected outright, and the first account's login
        must keep working correctly.
        """
        shared_email = "shared@both-orgs.io"
        register_org(client, org_name="Org Alpha", email=shared_email, password="AlphaPass1!")

        dupe_resp = client.post(
            "/api/v1/auth/register",
            json={
                "organization_name": "Org Beta",
                "email": shared_email,
                "password": "BetaPass1!",
                "full_name": "Beta User",
            },
        )
        assert dupe_resp.status_code == 400
        assert "already registered" in dupe_resp.json()["detail"]

        resp_alpha = client.post("/api/v1/auth/login", json={"email": shared_email, "password": "AlphaPass1!"})
        assert resp_alpha.status_code == 200


class TestMe:
    def test_me_requires_auth(self, client):
        resp = client.get("/api/v1/auth/me")
        assert resp.status_code == 401

    def test_me_returns_current_user(self, client):
        data = register_org(client, org_name="Me Co", email="me@example.com")
        resp = client.get("/api/v1/auth/me", headers=auth_header(data["access_token"]))
        assert resp.status_code == 200
        assert resp.json()["email"] == "me@example.com"

    def test_me_rejects_garbage_token(self, client):
        resp = client.get("/api/v1/auth/me", headers=auth_header("not-a-real-jwt"))
        assert resp.status_code == 401


class TestDemoSession:
    def test_demo_session_requires_seeded_demo_org(self, client):
        # No demo org exists in the freshly-migrated test database (app/seed.py was never run
        # against aipcc_test — by design, tests never depend on the demo dataset).
        resp = client.post("/api/v1/demo/session")
        assert resp.status_code == 503
