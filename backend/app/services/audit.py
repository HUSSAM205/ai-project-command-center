"""Audit trail writer (Phase 5). `log_audit_event` is called additively from existing write
endpoints — see app/api/auth.py (login), projects.py (create/update), tasks.py (assignment),
risks.py (create), budgets.py (transactions), documents.py (upload), ai.py/documents.py
(AI requests), admin.py (admin actions).
"""

import logging
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)


def _actor_uuid(user_id: str | UUID | None) -> UUID | None:
    if user_id is None:
        return None
    if isinstance(user_id, UUID):
        return user_id
    try:
        return UUID(user_id)
    except (ValueError, TypeError):
        # Anonymous demo sessions carry a non-UUID sentinel ("demo") as user_id — no real
        # user row to attribute the event to, so the actor is simply left null.
        return None


def log_audit_event(
    db: Session,
    *,
    organization_id: UUID,
    actor_user_id: str | UUID | None,
    action: str,
    entity_type: str,
    entity_id: UUID | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Best-effort audit trail write — mirrors the fire-and-forget posture of
    app.repositories.ai_requests.log_ai_request: never raises, so a logging failure can never
    break the caller's primary action. Call this *after* the caller's own db.commit() so this
    extra insert can't get entangled with (or accidentally roll back) the write it's recording.
    """
    try:
        row = AuditLog(
            organization_id=organization_id,
            actor_user_id=_actor_uuid(actor_user_id),
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            event_metadata=metadata or {},
        )
        db.add(row)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("failed to record audit_logs event action=%s entity_type=%s", action, entity_type)
