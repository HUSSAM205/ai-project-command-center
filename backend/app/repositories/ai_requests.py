from uuid import UUID

from sqlalchemy.orm import Session

from app.models.ai_request import AIRequest


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
