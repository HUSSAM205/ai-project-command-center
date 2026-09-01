from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.feedback import Feedback


def list_feedback(
    db: Session, organization_id: UUID, *, page: int = 1, page_size: int = 25
) -> tuple[list[Feedback], int]:
    total = (
        db.scalar(select(func.count()).select_from(Feedback).where(Feedback.organization_id == organization_id))
        or 0
    )
    stmt = (
        select(Feedback)
        .where(Feedback.organization_id == organization_id)
        .order_by(Feedback.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = list(db.scalars(stmt).all())
    return rows, total


def create_feedback(db: Session, organization_id: UUID, user_id: UUID | None, message: str) -> Feedback:
    row = Feedback(organization_id=organization_id, user_id=user_id, message=message)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
