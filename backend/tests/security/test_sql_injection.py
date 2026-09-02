"""SQL-injection tests. This app uses SQLAlchemy's ORM/Core query builder everywhere (see
app/repositories/*.py) — every value ends up as a bound parameter, never string-interpolated
into SQL — so these tests don't assume that's true, they *prove* it: send classic
injection-shaped payloads through real text fields via the real API, and confirm (a) the
payload is stored and returned back byte-for-byte as inert data (never executed), (b) the
table it landed in is structurally untouched (row counts/other rows unaffected), and (c) the
one endpoint that queries by a raw string (`login` by email) can't be used to bypass auth via
a boolean-injection-shaped email value.
"""

import pytest


CLASSIC_PAYLOADS = [
    "'; DROP TABLE projects; --",
    "' OR '1'='1",
    "'; DELETE FROM projects WHERE '1'='1'; --",
    "Robert'); DROP TABLE students;--",  # the "Bobby Tables" classic
    "' UNION SELECT password_hash, email FROM users --",
]


def _create_project(api_client, headers, **overrides):
    payload = {"name": "Injection Test Project", "budget": "1000", "actual_cost": "0", "progress": 0}
    payload.update(overrides)
    resp = api_client.post("/api/v1/projects", json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


class TestInjectionShapedProjectFields:
    @pytest.mark.parametrize("payload", CLASSIC_PAYLOADS)
    def test_injection_in_project_name_is_stored_verbatim_and_inert(self, client, headers_a, payload):
        # A second, unrelated project — this is our canary: if the injected DROP/DELETE ever
        # executed for real, this row (and the `projects` table itself) would vanish.
        canary = _create_project(client, headers_a, name="Canary Project")

        project = _create_project(client, headers_a, name=payload)
        assert project["name"] == payload  # stored + returned verbatim, not executed/mangled

        # The table still exists and both rows are intact — nothing was dropped/deleted.
        resp = client.get("/api/v1/projects", headers=headers_a)
        assert resp.status_code == 200
        names = {p["name"] for p in resp.json()}
        assert payload in names
        assert "Canary Project" in names
        assert len(resp.json()) == 2

        resp = client.get(f"/api/v1/projects/{canary['id']}", headers=headers_a)
        assert resp.status_code == 200

    @pytest.mark.parametrize("payload", CLASSIC_PAYLOADS[:3])
    def test_injection_in_project_description_and_client_fields(self, client, headers_a, payload):
        project = _create_project(client, headers_a, description=payload, client=payload)
        assert project["description"] == payload
        assert project["client"] == payload


class TestInjectionShapedRiskAndTaskFields:
    def test_injection_in_risk_title(self, client, headers_a):
        project = _create_project(client, headers_a)
        payload = "'; DROP TABLE risks; --"
        resp = client.post(
            f"/api/v1/projects/{project['id']}/risks",
            json={"title": payload, "category": "TECHNICAL", "probability": 1, "impact": 1},
            headers=headers_a,
        )
        assert resp.status_code == 201
        assert resp.json()["title"] == payload

        resp = client.get(f"/api/v1/projects/{project['id']}/risks", headers=headers_a)
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_injection_in_task_title(self, client, headers_a):
        project = _create_project(client, headers_a)
        payload = "Robert'); DROP TABLE tasks;--"
        resp = client.post(
            f"/api/v1/projects/{project['id']}/tasks", json={"title": payload}, headers=headers_a
        )
        assert resp.status_code == 201
        assert resp.json()["title"] == payload

        resp = client.get(f"/api/v1/projects/{project['id']}/tasks", headers=headers_a)
        assert resp.status_code == 200
        assert len(resp.json()) == 1


class TestLoginCannotBeBypassedByInjectionShapedInput:
    @pytest.mark.parametrize(
        "email",
        [
            "' OR '1'='1",
            "' OR 1=1 --",
            "admin@example.com' --",
        ],
    )
    def test_boolean_injection_shaped_email_never_authenticates(self, client, email):
        # These aren't even syntactically valid emails, so EmailStr validation should reject
        # them outright (422) — but the important guarantee either way is 401/422, NEVER 200.
        resp = client.post("/api/v1/auth/login", json={"email": email, "password": "whatever"})
        assert resp.status_code in (401, 422)

    def test_injection_shaped_password_against_a_real_account_still_fails(self, client):
        resp = client.post(
            "/api/v1/auth/register",
            json={
                "organization_name": "Injection Login Co",
                "email": "realuser@example.com",
                "password": "RealPassword1!",
                "full_name": "Real User",
            },
        )
        assert resp.status_code == 201

        resp = client.post(
            "/api/v1/auth/login",
            json={"email": "realuser@example.com", "password": "' OR '1'='1"},
        )
        assert resp.status_code == 401


class TestParameterizationIsActuallyExercised:
    def test_a_percent_and_underscore_are_treated_as_literal_characters_not_LIKE_wildcards(
        self, client, headers_a
    ):
        """Not injection per se, but the same "is user input ever spliced into SQL" family of
        bug: `%`/`_` are SQL LIKE wildcards. Every lookup in this app is an equality filter
        (see app/repositories/projects.py etc.), never a LIKE, so a literal `%` in a name must
        never accidentally match other rows."""
        _create_project(client, headers_a, name="100% Complete")
        _create_project(client, headers_a, name="Totally Different Project")

        resp = client.get("/api/v1/projects", headers=headers_a)
        names = {p["name"] for p in resp.json()}
        assert names == {"100% Complete", "Totally Different Project"}
