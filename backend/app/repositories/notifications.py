from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models.notification import Notification

LIST_LIMIT = 100


def list_notifications(db: Session, organization_id: UUID) -> list[Notification]:
    stmt = (
        select(Notification)
        .where(Notification.organization_id == organization_id)
        .order_by(Notification.created_at.desc())
        .limit(LIST_LIMIT)
    )
    return list(db.scalars(stmt).all())


def count_unread_notifications(db: Session, organization_id: UUID) -> int:
    stmt = select(func.count()).select_from(Notification).where(
        Notification.organization_id == organization_id, Notification.is_read.is_(False)
    )
    return int(db.scalar(stmt) or 0)


def get_notification(db: Session, organization_id: UUID, notification_id: UUID) -> Notification | None:
    stmt = select(Notification).where(
        Notification.organization_id == organization_id, Notification.id == notification_id
    )
    return db.scalar(stmt)


def mark_all_read(db: Session, organization_id: UUID) -> None:
    db.execute(
        update(Notification)
        .where(Notification.organization_id == organization_id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    db.commit()
