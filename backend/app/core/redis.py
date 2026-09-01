from functools import lru_cache

import redis

from app.core.config import settings


@lru_cache
def get_redis_client() -> redis.Redis:
    """Process-wide Redis client backing the AIRouter cache and rate limiter.

    Short connect/socket timeouts so a down Redis degrades AI endpoints (cache miss,
    rate-limit fails open — see app/ai/router.py) instead of hanging requests.
    """
    return redis.Redis.from_url(
        settings.REDIS_URL,
        decode_responses=True,
        socket_timeout=2.0,
        socket_connect_timeout=2.0,
    )
