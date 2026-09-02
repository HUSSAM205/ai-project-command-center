"""JWT tampering/expiry tests against app/core/security.py + app/core/deps.py."""

import uuid

import jwt as pyjwt
import pytest

from app.core.config import settings
from app.core.security import create_access_token
from tests.conftest import auth_header


class TestMissingOrMalformedAuth:
    def test_no_authorization_header_returns_401(self, client):
        resp = client.get("/api/v1/projects")
        assert resp.status_code == 401

    def test_malformed_bearer_scheme_returns_401_or_403(self, client):
        # A raw, non-"Bearer <token>" Authorization header — HTTPBearer(auto_error=False)
        # simply fails to extract credentials, so this ends up in the "not authenticated" path.
        resp = client.get("/api/v1/projects", headers={"Authorization": "NotBearer sometoken"})
        assert resp.status_code in (401, 403)

    def test_empty_token_returns_401(self, client):
        resp = client.get("/api/v1/projects", headers=auth_header(""))
        assert resp.status_code == 401

    def test_garbage_token_returns_401(self, client):
        resp = client.get("/api/v1/projects", headers=auth_header("this.is.not-a-jwt"))
        assert resp.status_code == 401


class TestTampering:
    def test_signature_tampering_is_rejected(self, client):
        token = create_access_token(
            user_id=str(uuid.uuid4()), organization_id=uuid.uuid4(), role="ADMIN", read_only=False
        )
        # Flip the last character of the signature segment.
        header_b64, payload_b64, sig_b64 = token.split(".")
        tampered_sig = (sig_b64[:-1] + ("A" if sig_b64[-1] != "A" else "B"))
        tampered_token = f"{header_b64}.{payload_b64}.{tampered_sig}"

        resp = client.get("/api/v1/projects", headers=auth_header(tampered_token))
        assert resp.status_code == 401

    def test_token_signed_with_wrong_secret_is_rejected(self, client):
        payload = {
            "sub": str(uuid.uuid4()),
            "organization_id": str(uuid.uuid4()),
            "role": "ADMIN",
            "read_only": False,
        }
        forged = pyjwt.encode(payload, "not-the-real-secret", algorithm=settings.JWT_ALGORITHM)
        resp = client.get("/api/v1/projects", headers=auth_header(forged))
        assert resp.status_code == 401

    def test_alg_none_token_is_rejected(self, client):
        """Classic JWT vulnerability: an attacker crafts an unsigned token with alg=none,
        hoping a naive verifier skips signature checking entirely. PyJWT's decode (used by
        app.core.security.decode_access_token) requires an explicit algorithms allowlist
        (["HS256"] here), so an alg=none token must be rejected outright."""
        header = pyjwt.utils.base64url_encode(b'{"alg":"none","typ":"JWT"}').decode()
        payload_bytes = (
            b'{"sub":"' + str(uuid.uuid4()).encode() + b'","organization_id":"'
            + str(uuid.uuid4()).encode() + b'","role":"ADMIN","read_only":false}'
        )
        payload = pyjwt.utils.base64url_encode(payload_bytes).decode()
        forged_token = f"{header}.{payload}."

        resp = client.get("/api/v1/projects", headers=auth_header(forged_token))
        assert resp.status_code == 401

    def test_role_escalation_by_editing_payload_is_rejected(self, client):
        """Even a syntactically-plausible tampered payload (e.g. flipping role to ADMIN)
        must fail signature verification — the token can't be re-signed without the secret."""
        token = create_access_token(
            user_id=str(uuid.uuid4()), organization_id=uuid.uuid4(), role="VIEWER", read_only=False
        )
        header_b64, payload_b64, sig_b64 = token.split(".")
        # Corrupt a byte in the payload segment (simulating an edited-then-reused payload).
        tampered_payload = payload_b64[:-1] + ("A" if payload_b64[-1] != "A" else "B")
        tampered_token = f"{header_b64}.{tampered_payload}.{sig_b64}"

        resp = client.get("/api/v1/projects", headers=auth_header(tampered_token))
        assert resp.status_code == 401


class TestExpiry:
    def test_expired_token_is_rejected(self, client):
        token = create_access_token(
            user_id=str(uuid.uuid4()),
            organization_id=uuid.uuid4(),
            role="ADMIN",
            read_only=False,
            expires_minutes=-1,  # already expired
        )
        resp = client.get("/api/v1/projects", headers=auth_header(token))
        assert resp.status_code == 401
        assert "expired" in resp.json()["detail"].lower()

    def test_freshly_issued_token_is_accepted(self, client):
        token = create_access_token(
            user_id=str(uuid.uuid4()), organization_id=uuid.uuid4(), role="ADMIN", read_only=False
        )
        resp = client.get("/api/v1/projects", headers=auth_header(token))
        assert resp.status_code == 200


class TestTokenMissingRequiredClaims:
    def test_token_without_organization_id_claim_is_rejected(self, client):
        payload = {"sub": str(uuid.uuid4()), "role": "ADMIN", "read_only": False}
        token = pyjwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
        resp = client.get("/api/v1/projects", headers=auth_header(token))
        assert resp.status_code == 401

    def test_token_with_malformed_organization_id_is_rejected(self, client):
        payload = {"sub": str(uuid.uuid4()), "organization_id": "not-a-uuid", "role": "ADMIN", "read_only": False}
        token = pyjwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
        resp = client.get("/api/v1/projects", headers=auth_header(token))
        assert resp.status_code == 401
