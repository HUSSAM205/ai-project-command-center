"""AIRouter  -  orchestrates every AI request: Gemini -> Groq -> Redis cache -> DemoAIProvider.

DemoAIProvider is unconditionally available, so `dispatch()` always succeeds  -  callers never
need to handle "no AI available"; the honesty guarantee lives entirely in AIResponse.source.

Reliability behavior per live-provider attempt:
- 20s request timeout (enforced inside each provider's httpx client)
- up to 2 retries with 1s/2s backoff
- a simple in-process circuit breaker: 3 consecutive failures marks a provider unavailable
  for a 60s cooldown, then allows exactly one retest

Caching: Redis-backed, keyed by organization_id + a hash of the request (method + context),
with organization_id baked directly into the key (not just hashed into the payload) so a
bug elsewhere can never cause one org's cached AI response to be served to another org.

Rate limiting: a Redis fixed-window counter per hour, keyed by org+user  -  5/hour for
anonymous/demo-scoped (read_only) tokens, 20/hour for authenticated ones.

Every dispatch (success or failure) is logged to the `ai_requests` table via
app.repositories.ai_requests.log_ai_request.
"""

import hashlib
import json
import logging
import time
from functools import lru_cache
from typing import Any
from uuid import UUID

import redis as redis_lib
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.ai.providers.demo import DemoAIProvider
from app.ai.providers.gemini import GeminiProvider
from app.ai.providers.groq import GroqProvider
from app.core.redis import get_redis_client
from app.repositories.ai_requests import log_ai_request
from app.schemas.ai import AIResponse

logger = logging.getLogger(__name__)

MAX_RETRIES = 2
RETRY_BACKOFF_SECONDS = [1, 2]
CIRCUIT_FAILURE_THRESHOLD = 3
CIRCUIT_COOLDOWN_SECONDS = 60.0
# Long enough that a cached live-provider answer is actually useful within a session, short
# enough that a stale answer doesn't linger for days once the underlying data has changed.
CACHE_TTL_SECONDS = 30 * 60
ANONYMOUS_RATE_LIMIT_PER_HOUR = 5
AUTHENTICATED_RATE_LIMIT_PER_HOUR = 20


class _CircuitState:
    __slots__ = ("failures", "opened_until")

    def __init__(self) -> None:
        self.failures = 0
        self.opened_until: float | None = None


class AIRouter:
    def __init__(self, redis_client: "redis_lib.Redis | None" = None):
        self.redis = redis_client or get_redis_client()
        self.gemini = GeminiProvider()
        self.groq = GroqProvider()
        self.demo = DemoAIProvider()
        self._live_providers = [self.gemini, self.groq]
        self._circuits: dict[str, _CircuitState] = {p.name: _CircuitState() for p in self._live_providers}

    # ---- rate limiting ----

    def enforce_rate_limit(self, *, scope_key: str, read_only: bool) -> None:
        """Raises 429 if the caller has exceeded their hourly AI request budget.
        Fails open (allows the request) if Redis itself is unreachable  -  a down cache
        should degrade AI endpoints, not take them offline entirely."""
        limit = ANONYMOUS_RATE_LIMIT_PER_HOUR if read_only else AUTHENTICATED_RATE_LIMIT_PER_HOUR
        window = time.strftime("%Y%m%d%H", time.gmtime())
        key = f"ai:ratelimit:{scope_key}:{window}"
        try:
            count = self.redis.incr(key)
            if count == 1:
                self.redis.expire(key, 3600)
        except redis_lib.RedisError:
            logger.warning("AI rate limiter: redis unavailable, failing open")
            return
        if count > limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"AI request rate limit exceeded ({limit}/hour). Try again later.",
            )

    # ---- cache ----

    def _cache_key(self, organization_id: UUID, method_name: str, context: dict) -> str:
        raw = json.dumps({"m": method_name, "c": context}, sort_keys=True, default=str)
        digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        return f"ai:cache:{organization_id}:{method_name}:{digest}"

    def _cache_get(self, key: str) -> AIResponse | None:
        try:
            raw = self.redis.get(key)
        except redis_lib.RedisError:
            return None
        if not raw:
            return None
        try:
            payload: dict[str, Any] = json.loads(raw)
        except (TypeError, ValueError):
            return None
        payload["source"] = "cache"
        try:
            return AIResponse.model_validate(payload)
        except Exception:
            return None

    def _cache_set(self, key: str, response: AIResponse) -> None:
        try:
            self.redis.set(key, response.model_dump_json(), ex=CACHE_TTL_SECONDS)
        except redis_lib.RedisError:
            pass

    # ---- circuit breaker ----

    def _circuit_available(self, provider_name: str) -> bool:
        state = self._circuits[provider_name]
        if state.opened_until is None:
            return True
        if time.monotonic() >= state.opened_until:
            # cooldown elapsed  -  allow exactly one retest before re-arming the breaker
            state.opened_until = None
            state.failures = 0
            return True
        return False

    def _record_success(self, provider_name: str) -> None:
        state = self._circuits[provider_name]
        state.failures = 0
        state.opened_until = None

    def _record_failure(self, provider_name: str) -> None:
        state = self._circuits[provider_name]
        state.failures += 1
        if state.failures >= CIRCUIT_FAILURE_THRESHOLD:
            state.opened_until = time.monotonic() + CIRCUIT_COOLDOWN_SECONDS

    # ---- per-provider call with retry ----

    def _call_provider(self, provider, method_name: str, context: dict) -> AIResponse:
        last_exc: Exception | None = None
        for attempt in range(MAX_RETRIES + 1):
            try:
                method = getattr(provider, method_name)
                return method(context)
            except Exception as exc:  # noqa: BLE001 - any provider failure triggers fallback, not a 500
                last_exc = exc
                if attempt < MAX_RETRIES:
                    time.sleep(RETRY_BACKOFF_SECONDS[attempt])
        assert last_exc is not None
        raise last_exc

    # ---- main entrypoint ----

    def dispatch(
        self,
        db: Session,
        *,
        organization_id: UUID,
        endpoint: str,
        method_name: str,
        context: dict,
    ) -> AIResponse:
        started = time.monotonic()
        provider_used = "none"
        success = False
        try:
            for provider in self._live_providers:
                if not provider.is_available():
                    continue
                if not self._circuit_available(provider.name):
                    continue
                try:
                    response = self._call_provider(provider, method_name, context)
                except Exception as exc:  # noqa: BLE001
                    logger.warning("AI provider %s failed for %s: %s", provider.name, method_name, exc)
                    self._record_failure(provider.name)
                    continue
                self._record_success(provider.name)
                provider_used = provider.name
                success = True
                self._cache_set(self._cache_key(organization_id, method_name, context), response)
                return response

            cached = self._cache_get(self._cache_key(organization_id, method_name, context))
            if cached is not None:
                provider_used = "cache"
                success = True
                return cached

            response = getattr(self.demo, method_name)(context)
            provider_used = "demo_ai"
            success = True
            return response
        finally:
            latency_ms = int((time.monotonic() - started) * 1000)
            try:
                log_ai_request(db, organization_id, endpoint, provider_used, success, latency_ms)
            except Exception:
                logger.exception("failed to record ai_requests log row")


@lru_cache
def get_ai_router() -> AIRouter:
    """Process-wide AIRouter singleton (FastAPI dependency)  -  the in-process circuit
    breaker state needs to persist across requests, not reset every call."""
    return AIRouter()
