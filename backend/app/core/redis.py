from functools import lru_cache

import redis

from app.core.config import settings


@lru_cache
def get_redis_client() -> redis.Redis:
    """Process-wide Redis client backing the AIRouter cache and rate limiter.

    Short connect/socket timeouts so a down Redis degrades AI endpoints (cache miss,
    rate-limit fails open — see app/ai/router.py) instead of hanging requests.

    0.3s, not the original 2.0s: an unreachable Redis (e.g. no REDIS_URL configured in this
    deployment yet) should fail near-instantly, not slowly. A single AI request can make up to
    3-4 Redis calls (rate-limit incr+expire, cache get, cache set) via this same client; at 2.0s
    each, a fully-unreachable Redis added up to 6-8s of pure connection-timeout waste on top of
    the actual work, which combined with a cold Render start was enough to blow past the
    reverse-proxy's request timeout and surface as a 502 to the browser. 0.3s is generous for a
    real (even distant) Redis to respond to a TCP handshake, while making the "not configured
    at all" case cheap.
    """
    return redis.Redis.from_url(
        settings.REDIS_URL,
        decode_responses=True,
        socket_timeout=0.3,
        socket_connect_timeout=0.3,
    )
