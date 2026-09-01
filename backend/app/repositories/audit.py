from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


def list_audit_logs(
    db: Session,
    organization_id: UUID,
    *,
    action: str | None = None,
    entity_type: str | None = None,
    page: int = 1,
    page_size: int = 25,
) -> tuple[list[AuditLog], int]:
    filters = [AuditLog.organization_id == organization_id]
    if action:
        filters.append(AuditLog.action == action)
    if entity_type:
        filters.append(AuditLog.entity_type == entity_type)

    total = db.scalar(select(func.count()).select_from(AuditLog).where(*filters)) or 0

    stmt = (
        select(AuditLog)
        .where(*filters)
        .order_by(AuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = list(db.scalars(stmt).all())
    return rows, total
