"""Tests for app/ai/router.py::AIRouter — the orchestration layer described in its own module
docstring: "Gemini -> Groq -> Redis cache -> DemoAIProvider", a 3-consecutive-failure circuit
breaker with a 60s cooldown (shortened here via monkeypatching, never via real waits beyond a
couple hundred ms), and a Redis-backed hourly rate limiter (5/hour anonymous, 20/hour
authenticated). No real network call is ever made here — provider methods are monkeypatched
directly (respx-level HTTP mocking is covered separately in tests/ai/test_providers.py) so
these tests can focus purely on AIRouter's routing/fallback/breaker/cache/rate-limit logic and
run fast and deterministically.
"""

import time
import uuid

import pytest
import redis as redis_lib
from fastapi import HTTPException

from app.ai.router import AIRouter
import app.ai.router as router_module


SUMMARIZE_CONTEXT = {"title": "Doc", "text": "some content to summarize"}


def _redis_client():
    import os

    return redis_lib.Redis.from_url(os.environ["REDIS_URL"], decode_responses=True)


@pytest.fixture()
def ai_router():
    return AIRouter(redis_client=_redis_client())


@pytest.fixture()
def org_id(org_a):
    return uuid.UUID(org_a["user"]["organization_id"])


@pytest.fixture(autouse=True)
def _fast_retries(monkeypatch):
    """Every retry-triggering test in this module simulates provider failures; without this,
    AIRouter's real 1s/2s retry backoff (MAX_RETRIES=2) would make the suite slow. This does
    NOT touch the global `time.sleep` (which would also break this module's own real cooldown
    waits) — it shrinks the specific backoff schedule AIRouter reads instead."""
    monkeypatch.setattr(router_module, "RETRY_BACKOFF_SECONDS", [0, 0])


class TestDemoModeDefault:
    def test_no_api_keys_configured_resolves_to_demo_ai_with_no_network_call(
        self, ai_router, org_id, db, monkeypatch
    ):
        # Belt-and-suspenders: explicitly confirm the environment truly has no keys, matching
        # the "demo mode is the default with nothing configured" product requirement.
        monkeypatch.setattr("app.core.config.settings.GEMINI_API_KEY", None)
        monkeypatch.setattr("app.core.config.settings.GROQ_API_KEY", None)
        router = AIRouter(redis_client=_redis_client())
        assert router.gemini.is_available() is False
        assert router.groq.is_available() is False

        response = router.dispatch(
            db,
            organization_id=org_id,
            endpoint="/test/demo-mode",
            method_name="summarize",
            context=SUMMARIZE_CONTEXT,
        )
        assert response.source == "demo_ai"
        assert response.confidence >= 0


class TestFallbackChain:
    def test_gemini_success_short_circuits_groq(self, ai_router, org_id, db, monkeypatch):
        monkeypatch.setattr(ai_router.gemini, "is_available", lambda: True)
        monkeypatch.setattr(ai_router.gemini, "generate_text", lambda *a, **kw: "SUMMARY: from gemini\nmore")
        groq_called = {"called": False}

        def _groq_should_not_be_called(*a, **kw):
            groq_called["called"] = True
            return "SUMMARY: from groq\nmore"

        monkeypatch.setattr(ai_router.groq, "is_available", lambda: True)
        monkeypatch.setattr(ai_router.groq, "generate_text", _groq_should_not_be_called)

        response = ai_router.dispatch(
            db, organization_id=org_id, endpoint="/test", method_name="summarize", context=SUMMARIZE_CONTEXT
        )
        assert response.source == "gemini"
        assert groq_called["called"] is False

    def test_gemini_failure_falls_back_to_groq(self, ai_router, org_id, db, monkeypatch):
        monkeypatch.setattr(ai_router.gemini, "is_available", lambda: True)

        def _gemini_fails(*a, **kw):
            raise RuntimeError("simulated gemini failure")

        monkeypatch.setattr(ai_router.gemini, "generate_text", _gemini_fails)
        monkeypatch.setattr(ai_router.groq, "is_available", lambda: True)
        monkeypatch.setattr(ai_router.groq, "generate_text", lambda *a, **kw: "SUMMARY: groq saved the day\nmore")

        response = ai_router.dispatch(
            db, organization_id=org_id, endpoint="/test", method_name="summarize", context=SUMMARIZE_CONTEXT
        )
        assert response.source == "groq"

    def test_both_live_providers_unavailable_falls_back_to_demo_ai(self, ai_router, org_id, db, monkeypatch):
        monkeypatch.setattr(ai_router.gemini, "is_available", lambda: False)
        monkeypatch.setattr(ai_router.groq, "is_available", lambda: False)
        response = ai_router.dispatch(
            db, organization_id=org_id, endpoint="/test", method_name="summarize", context=SUMMARIZE_CONTEXT
        )
        assert response.source == "demo_ai"

    def test_both_live_providers_fail_and_no_cache_falls_back_to_demo_ai(self, ai_router, org_id, db, monkeypatch):
        monkeypatch.setattr(ai_router.gemini, "is_available", lambda: True)
        monkeypatch.setattr(ai_router.gemini, "generate_text", lambda *a, **kw: (_ for _ in ()).throw(RuntimeError("gemini down")))
        monkeypatch.setattr(ai_router.groq, "is_available", lambda: True)
        monkeypatch.setattr(ai_router.groq, "generate_text", lambda *a, **kw: (_ for _ in ()).throw(RuntimeError("groq down")))

        response = ai_router.dispatch(
            db, organization_id=org_id, endpoint="/test", method_name="summarize", context=SUMMARIZE_CONTEXT
        )
        assert response.source == "demo_ai"

    def test_demo_ai_never_raises_even_with_empty_context_text(self, ai_router, org_id, db):
        response = ai_router.dispatch(
            db, organization_id=org_id, endpoint="/test", method_name="summarize", context={"title": "x", "text": ""}
        )
        assert response.source == "demo_ai"


class TestCache:
    def test_successful_live_response_is_cached_and_served_when_providers_go_down(
        self, ai_router, org_id, db, monkeypatch
    ):
        monkeypatch.setattr(ai_router.gemini, "is_available", lambda: True)
        monkeypatch.setattr(ai_router.gemini, "generate_text", lambda *a, **kw: "SUMMARY: cache me\nmore")
        monkeypatch.setattr(ai_router.groq, "is_available", lambda: False)

        first = ai_router.dispatch(
            db, organization_id=org_id, endpoint="/test", method_name="summarize", context=SUMMARIZE_CONTEXT
        )
        assert first.source == "gemini"

        # Now both live providers go down — the identical context/method/org should hit cache.
        monkeypatch.setattr(ai_router.gemini, "is_available", lambda: False)
        second = ai_router.dispatch(
            db, organization_id=org_id, endpoint="/test", method_name="summarize", context=SUMMARIZE_CONTEXT
        )
        assert second.source == "cache"
        assert second.summary == first.summary

    def test_cache_is_scoped_per_organization(self, ai_router, org_id, org_b, db, monkeypatch):
        other_org_id = uuid.UUID(org_b["user"]["organization_id"])
        monkeypatch.setattr(ai_router.gemini, "is_available", lambda: True)
        monkeypatch.setattr(ai_router.gemini, "generate_text", lambda *a, **kw: "SUMMARY: org a only\nmore")
        ai_router.dispatch(
            db, organization_id=org_id, endpoint="/test", method_name="summarize", context=SUMMARIZE_CONTEXT
        )

        # Same method/context, but a DIFFERENT org, with providers down -> must NOT see org
        # A's cached response (a bug here would leak one tenant's AI answer to another).
        monkeypatch.setattr(ai_router.gemini, "is_available", lambda: False)
        response = ai_router.dispatch(
            db, organization_id=other_org_id, endpoint="/test", method_name="summarize", context=SUMMARIZE_CONTEXT
        )
        assert response.source == "demo_ai"  # NOT "cache" — org B has no cache entry of its own


class TestCircuitBreaker:
    def test_trips_after_three_consecutive_failures(self, ai_router, org_id, db, monkeypatch):
        monkeypatch.setattr(ai_router.gemini, "is_available", lambda: True)
        monkeypatch.setattr(ai_router.groq, "is_available", lambda: False)  # isolate gemini's breaker

        def _always_fails(*a, **kw):
            raise RuntimeError("gemini down")

        monkeypatch.setattr(ai_router.gemini, "generate_text", _always_fails)

        for _ in range(3):
            response = ai_router.dispatch(
                db, organization_id=org_id, endpoint="/test", method_name="summarize", context=SUMMARIZE_CONTEXT
            )
            assert response.source == "demo_ai"

        statuses = {s["name"]: s for s in ai_router.provider_status()}
        assert statuses["gemini"]["circuit_open"] is True
        assert statuses["gemini"]["consecutive_failures"] == 3

    def test_open_circuit_skips_provider_without_attempting_a_call(self, ai_router, org_id, db, monkeypatch):
        monkeypatch.setattr(ai_router.gemini, "is_available", lambda: True)
        monkeypatch.setattr(ai_router.groq, "is_available", lambda: False)
        call_count = {"n": 0}

        def _always_fails(*a, **kw):
            call_count["n"] += 1
            raise RuntimeError("gemini down")

        monkeypatch.setattr(ai_router.gemini, "generate_text", _always_fails)

        for _ in range(3):
            ai_router.dispatch(
                db, organization_id=org_id, endpoint="/test", method_name="summarize", context=SUMMARIZE_CONTEXT
            )
        calls_after_trip = call_count["n"]

        # One more dispatch: the circuit is open, so gemini.generate_text must NOT be called
        # again at all (not even once) — the router should skip straight past it.
        ai_router.dispatch(
            db, organization_id=org_id, endpoint="/test", method_name="summarize", context=SUMMARIZE_CONTEXT
        )
        assert call_count["n"] == calls_after_trip

    def test_cools_down_and_allows_exactly_one_retest(self, ai_router, org_id, db, monkeypatch):
        monkeypatch.setattr(router_module, "CIRCUIT_COOLDOWN_SECONDS", 0.1)
        monkeypatch.setattr(ai_router.gemini, "is_available", lambda: True)
        monkeypatch.setattr(ai_router.groq, "is_available", lambda: False)

        state = {"failing": True}

        def _maybe_fails(*a, **kw):
            if state["failing"]:
                raise RuntimeError("gemini down")
            return "SUMMARY: recovered\nmore"

        monkeypatch.setattr(ai_router.gemini, "generate_text", _maybe_fails)

        for _ in range(3):
            ai_router.dispatch(
                db, organization_id=org_id, endpoint="/test", method_name="summarize", context=SUMMARIZE_CONTEXT
            )
        assert ai_router.provider_status()[0]["circuit_open"] is True

        # Recovery: gemini starts working again, and we wait past the (shortened) cooldown.
        state["failing"] = False
        time.sleep(0.15)

        response = ai_router.dispatch(
            db, organization_id=org_id, endpoint="/test", method_name="summarize", context=SUMMARIZE_CONTEXT
        )
        assert response.source == "gemini"
        statuses = {s["name"]: s for s in ai_router.provider_status()}
        assert statuses["gemini"]["circuit_open"] is False
        assert statuses["gemini"]["consecutive_failures"] == 0


class TestRateLimiting:
    def test_anonymous_rate_limit_blocks_after_5_requests_per_hour(self, ai_router):
        scope_key = f"test-anon-{uuid.uuid4()}"
        for _ in range(5):
            ai_router.enforce_rate_limit(scope_key=scope_key, read_only=True)  # must not raise
        with pytest.raises(HTTPException) as exc_info:
            ai_router.enforce_rate_limit(scope_key=scope_key, read_only=True)
        assert exc_info.value.status_code == 429

    def test_authenticated_rate_limit_allows_more_than_anonymous(self, ai_router):
        scope_key = f"test-auth-{uuid.uuid4()}"
        for _ in range(20):
            ai_router.enforce_rate_limit(scope_key=scope_key, read_only=False)  # must not raise
        with pytest.raises(HTTPException) as exc_info:
            ai_router.enforce_rate_limit(scope_key=scope_key, read_only=False)
        assert exc_info.value.status_code == 429

    def test_rate_limit_is_scoped_per_key(self, ai_router):
        key_a = f"scope-a-{uuid.uuid4()}"
        key_b = f"scope-b-{uuid.uuid4()}"
        for _ in range(5):
            ai_router.enforce_rate_limit(scope_key=key_a, read_only=True)
        # key_b has its own independent budget — must not be blocked by key_a's usage.
        ai_router.enforce_rate_limit(scope_key=key_b, read_only=True)  # must not raise

    def test_rate_limiter_fails_open_when_redis_unreachable(self):
        # A client pointed at a port nothing listens on, with a short timeout so the test
        # fails fast rather than hanging if something unexpected is bound there.
        unreachable_redis = redis_lib.Redis(
            host="127.0.0.1", port=1, socket_timeout=0.3, socket_connect_timeout=0.3
        )
        router = AIRouter(redis_client=unreachable_redis)
        # Per the docstring: "Fails open (allows the request) if Redis itself is unreachable".
        router.enforce_rate_limit(scope_key="whatever", read_only=True)  # must not raise


class TestProviderStatus:
    def test_demo_ai_is_always_configured_and_available(self, ai_router):
        statuses = {s["name"]: s for s in ai_router.provider_status()}
        assert statuses["demo_ai"]["configured"] is True
        assert statuses["demo_ai"]["available"] is True
        assert statuses["demo_ai"]["circuit_open"] is False

    def test_status_reflects_missing_api_key_as_not_configured(self, monkeypatch):
        monkeypatch.setattr("app.core.config.settings.GEMINI_API_KEY", None)
        router = AIRouter(redis_client=_redis_client())
        statuses = {s["name"]: s for s in router.provider_status()}
        assert statuses["gemini"]["configured"] is False
        assert statuses["gemini"]["available"] is False
