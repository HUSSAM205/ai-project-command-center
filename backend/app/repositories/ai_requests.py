from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.ai_request import AIRequest


def list_ai_requests_for_org(db: Session, organization_id: UUID) -> list[AIRequest]:
    """Org-scoped AI usage log, most recent first. Feeds the `ai_transformation` report
    (real adoption/telemetry data — never fabricated) and, eventually, the Phase 5 admin
    usage view mentioned in docs/TODO.md."""
    stmt = (
        select(AIRequest)
        .where(AIRequest.organization_id == organization_id)
        .order_by(AIRequest.created_at.desc())
    )
    return list(db.scalars(stmt).all())


def log_ai_request(
    db: Session,
    organization_id: UUID,
    endpoint: str,
    provider_used: str,
    success: bool,
    latency_ms: int,
) -> AIRequest:
    row = AIRequest(
        organization_id=organization_id,
        endpoint=endpoint,
        provider_used=provider_used,
        success=success,
        latency_ms=latency_ms,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
