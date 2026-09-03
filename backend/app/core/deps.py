from dataclasses import dataclass
from typing import Callable
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.role import Permission, RolePermission

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass
class CurrentPrincipal:
    """Represents the caller's identity as derived from the JWT.

    `organization_id` is always taken from the token, never from client input —
    every org-scoped query in the app must filter by this value.
    """

    user_id: str
    organization_id: UUID
    role: str
    read_only: bool
    # Per-token random id, present only on anonymous/demo tokens (see create_access_token) --
    # use this instead of user_id for anything that needs to distinguish one anonymous visitor
    # from another (rate-limit scope keys), since user_id is the same "demo" sentinel for all of
    # them. None for real authenticated users, who are already uniquely identified by user_id.
    session_id: str | None = None


def _principal_from_token(token: str) -> CurrentPrincipal:
    try:
        payload = decode_access_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token")

    try:
        organization_id = UUID(payload["organization_id"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token")

    return CurrentPrincipal(
        user_id=payload.get("sub", "demo"),
        organization_id=organization_id,
        role=payload.get("role", "VIEWER"),
        read_only=bool(payload.get("read_only", False)),
        session_id=payload.get("sid"),
    )


def get_current_principal(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentPrincipal:
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _principal_from_token(credentials.credentials)


def get_stream_principal(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentPrincipal:
    """Auth for SSE routes only: the browser's EventSource API cannot set an
    Authorization header, so this accepts a `?token=` query param as a fallback
    when no header is present. Read-only GET routes only — never use this for
    a mutating endpoint, since query strings can end up in server/proxy logs."""
    token = credentials.credentials if credentials and credentials.credentials else request.query_params.get("token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _principal_from_token(token)


def require_write_access(
    principal: CurrentPrincipal = Depends(get_current_principal),
) -> CurrentPrincipal:
    """Guard for mutating (POST/PATCH/PUT/DELETE) endpoints.

    Demo-scoped tokens carry read_only=true and must never be able to mutate data,
    including the demo organization's own seeded data.
    """
    if principal.read_only:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="demo organizations are read-only",
        )
    return principal


def get_db_session(db: Session = Depends(get_db)) -> Session:
    return db


def require_role(*roles: str) -> Callable[[CurrentPrincipal], CurrentPrincipal]:
    """Guard for role-gated endpoints — e.g. `Depends(require_role("ADMIN"))`. Additive on top
    of `get_current_principal`/`require_write_access`, not a replacement: this only checks the
    caller's role, so pair it with `require_write_access` too on any mutating route that also
    needs the existing demo-read-only behavior."""

    def _dependency(principal: CurrentPrincipal = Depends(get_current_principal)) -> CurrentPrincipal:
        if principal.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="insufficient role")
        return principal

    return _dependency


def require_permission(permission_key: str) -> Callable[[CurrentPrincipal, Session], CurrentPrincipal]:
    """Guard backed by the `permissions`/`role_permissions` tables (see app/models/role.py):
    the caller's role must actually have `permission_key` granted in the database, not just
    match a hardcoded role name. Used today to gate the /admin/* surface
    (`require_permission("admin.access")`); additive on top of `get_current_principal`, and the
    seeded grants (see the Phase 5 migration) cover the rest of the permission catalog for
    future wiring onto domain routers without needing another schema change.
    """

    def _dependency(
        principal: CurrentPrincipal = Depends(get_current_principal),
        db: Session = Depends(get_db),
    ) -> CurrentPrincipal:
        granted = db.scalar(
            select(RolePermission.id)
            .join(Permission, Permission.id == RolePermission.permission_id)
            .where(RolePermission.role == principal.role, Permission.key == permission_key)
        )
        if granted is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="insufficient permissions")
        return principal

    return _dependency
