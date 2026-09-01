"""Security response headers (Phase 5 hardening, on top of the Phase 1 CORS baseline in
main.py). These are static, response-shape headers — not a substitute for CSP/HSTS at the
reverse-proxy/CDN layer in production, but a sane default for the app itself."""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        return response
