from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def create_access_token(
    *,
    user_id: UUID | str | None,
    organization_id: UUID | str,
    role: str,
    read_only: bool = False,
    expires_minutes: int | None = None,
    session_id: str | None = None,
    email: str | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    expires_delta = timedelta(minutes=expires_minutes or settings.JWT_EXPIRES_MINUTES)
    payload: dict[str, Any] = {
        "sub": str(user_id) if user_id is not None else "demo",
        "organization_id": str(organization_id),
        "role": role,
        "read_only": read_only,
        "iat": now,
        "exp": now + expires_delta,
    }
    if email is not None:
        # Real accounts only (demo/anonymous tokens never carry one) -- lets CurrentPrincipal
        # expose the caller's email for audit logging (app/services/audit.py's actor_email)
        # without an extra User lookup on every write.
        payload["email"] = email
    if session_id is not None:
        # Anonymous/demo tokens all carry the same "demo" sentinel `sub` (see above) — that's
        # relied on elsewhere (audit.py, consulting.py) as "not a real user row, don't try to
        # use this as a FK". `sid` is a separate, per-token random id used only to give each
        # anonymous visitor their own AI rate-limit bucket (app/ai/router.py's scope_key) instead
        # of every anonymous visitor on the internet sharing one global bucket keyed off "demo".
        payload["sid"] = session_id
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
