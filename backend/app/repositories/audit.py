from datetime import date, datetime, time, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


def _build_filters(
    organization_id: UUID,
    *,
    action: str | None,
    entity_type: str | None,
    date_from: date | None,
    date_to: date | None,
):
    filters = [AuditLog.organization_id == organization_id]
    if action:
        filters.append(AuditLog.action == action)
    if entity_type:
        filters.append(AuditLog.entity_type == entity_type)
    if date_from:
        filters.append(AuditLog.created_at >= datetime.combine(date_from, time.min, tzinfo=timezone.utc))
    if date_to:
        filters.append(AuditLog.created_at <= datetime.combine(date_to, time.max, tzinfo=timezone.utc))
    return filters


def list_audit_logs(
    db: Session,
    organization_id: UUID,
    *,
    action: str | None = None,
    entity_type: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = 1,
    page_size: int = 25,
) -> tuple[list[AuditLog], int]:
    filters = _build_filters(
        organization_id, action=action, entity_type=entity_type, date_from=date_from, date_to=date_to
    )

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


# A compliance export is a real, unpaginated data pull -- capped, not truly unlimited, so one
# organization's CSV export can't accidentally hang a request or return an unbounded response body.
EXPORT_ROW_LIMIT = 5000


def iter_audit_logs_for_export(
    db: Session,
    organization_id: UUID,
    *,
    action: str | None = None,
    entity_type: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[AuditLog]:
    filters = _build_filters(
        organization_id, action=action, entity_type=entity_type, date_from=date_from, date_to=date_to
    )
    stmt = select(AuditLog).where(*filters).order_by(AuditLog.created_at.desc()).limit(EXPORT_ROW_LIMIT)
    return list(db.scalars(stmt).all())


def list_audit_logs_for_chain_verification(db: Session, organization_id: UUID) -> list[AuditLog]:
    """Every hash-chained row (record_hash IS NOT NULL) for this org, oldest first -- the order
    app/api/audit.py's /health endpoint needs to walk the chain forward and re-verify it."""
    stmt = (
        select(AuditLog)
        .where(AuditLog.organization_id == organization_id, AuditLog.record_hash.is_not(None))
        .order_by(AuditLog.created_at.asc())
    )
    return list(db.scalars(stmt).all())


def count_audit_logs_total(db: Session, organization_id: UUID) -> int:
    return db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.organization_id == organization_id)) or 0
