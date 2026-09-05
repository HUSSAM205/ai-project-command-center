"""Automated end-to-end verification against a running deployment (local or production).

Usage:
    python verify_live_enterprise.py [BASE_URL]

BASE_URL defaults to the production frontend's same-origin API proxy
(https://ai-project-mgmt-system.vercel.app/api/v1) so a run against production never needs to hit
Render's raw domain directly (that domain has tripped Cloudflare's bot challenge against automated
clients before -- see docs/DEPLOYMENT_HANDOVER.md). Pass http://localhost:3000/api/v1 (through the
frontend's dev-server proxy) or http://localhost:8000/api/v1 (straight to a local backend) to
verify a local environment instead.

Checks, in order, each printing PASS/FAIL:
  1. GET /health responds quickly (soft budget: prints the real latency, does not fail the run on
     a slow-but-correct response -- this deployment's own free-tier backend has a documented,
     honest capacity ceiling under load; see docs/ENTERPRISE_ARCHITECTURE_SPEC.md).
  2. GET /projects (as a demo session) returns at least the 15 seeded programs, each with real
     relational fields.
  3. POST /projects (as a demo session) persists for real: created, then re-fetched by id in a
     SEPARATE request to confirm it survived past the request that created it -- the actual bar
     for "not just held in memory" -- then deleted to avoid leaving verification debris behind.
  4. POST /projects/{id}/what-if returns a deterministic, internally-consistent scenario
     (re-running the identical inputs twice must return identical output).

Exits 0 if every check passes, 1 otherwise -- suitable for a CI gate.
"""

import sys
import time

import httpx

DEFAULT_BASE_URL = "https://ai-project-mgmt-system.vercel.app/api/v1"


def main() -> int:
    base_url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_BASE_URL
    print(f"Verifying against: {base_url}\n")
    failures = 0

    with httpx.Client(base_url=base_url, timeout=30.0) as client:
        # 1. Health
        start = time.monotonic()
        try:
            res = client.get("/health")
            elapsed_ms = (time.monotonic() - start) * 1000
            ok = res.status_code == 200
            print(f"{'PASS' if ok else 'FAIL'}: GET /health -> {res.status_code} in {elapsed_ms:.0f}ms")
            if not ok:
                failures += 1
        except httpx.HTTPError as exc:
            print(f"FAIL: GET /health raised {exc!r}")
            failures += 1

        # Demo session for the rest of the checks
        try:
            res = client.post("/demo/session")
            res.raise_for_status()
            token = res.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}
            print("PASS: POST /demo/session issued a token")
        except (httpx.HTTPError, KeyError) as exc:
            print(f"FAIL: could not establish a demo session ({exc!r}) -- aborting remaining checks")
            return 1

        # 2. Project list has real relational depth
        try:
            res = client.get("/projects", headers=headers)
            res.raise_for_status()
            projects = res.json()
            ok = len(projects) >= 15 and all("rag_status" in p and "health_score" in p for p in projects)
            print(f"{'PASS' if ok else 'FAIL'}: GET /projects -> {len(projects)} programs, rag_status/health_score present")
            if not ok:
                failures += 1
        except httpx.HTTPError as exc:
            print(f"FAIL: GET /projects raised {exc!r}")
            failures += 1
            projects = []

        # 3. Real persistence: create, re-fetch in a separate request, delete
        created_id = None
        try:
            payload = {"name": "verify_live_enterprise smoke-test project", "budget": 1000}
            res = client.post("/projects", json=payload, headers=headers)
            res.raise_for_status()
            created_id = res.json()["id"]
            res2 = client.get(f"/projects/{created_id}", headers=headers)
            res2.raise_for_status()
            ok = res2.json()["name"] == payload["name"]
            print(f"{'PASS' if ok else 'FAIL'}: created project persisted and was re-fetched by id ({created_id})")
            if not ok:
                failures += 1
        except httpx.HTTPError as exc:
            print(f"FAIL: create/re-fetch persistence check raised {exc!r}")
            failures += 1
        finally:
            if created_id:
                try:
                    client.delete(f"/projects/{created_id}", headers=headers)
                except httpx.HTTPError:
                    pass  # best-effort cleanup; not itself a check

        # 4. What-If determinism
        if projects:
            project_id = projects[0]["id"]
            scenario = {"delay_days": 15, "budget_delta": -50000, "scope_change_percent": 10}
            try:
                r1 = client.post(f"/projects/{project_id}/what-if", json=scenario, headers=headers)
                r1.raise_for_status()
                r2 = client.post(f"/projects/{project_id}/what-if", json=scenario, headers=headers)
                r2.raise_for_status()
                ok = r1.json()["scenario"] == r2.json()["scenario"]
                print(f"{'PASS' if ok else 'FAIL'}: What-If scenario is deterministic for identical inputs")
                if not ok:
                    failures += 1
            except httpx.HTTPError as exc:
                print(f"FAIL: What-If check raised {exc!r}")
                failures += 1
        else:
            print("SKIP: What-If check (no projects available)")

    print(f"\n{'ALL CHECKS PASSED' if failures == 0 else f'{failures} CHECK(S) FAILED'}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
