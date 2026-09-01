from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.budget import Budget, BudgetTransaction
from app.models.project import Project


def get_budget(db: Session, organization_id: UUID, project_id: UUID) -> Budget | None:
    stmt = (
        select(Budget)
        .join(Project, Budget.project_id == Project.id)
        .where(Project.organization_id == organization_id, Budget.project_id == project_id)
    )
    return db.scalar(stmt)


def list_transactions(db: Session, organization_id: UUID, project_id: UUID) -> list[BudgetTransaction]:
    stmt = (
        select(BudgetTransaction)
        .join(Project, BudgetTransaction.project_id == Project.id)
        .where(Project.organization_id == organization_id, BudgetTransaction.project_id == project_id)
        .order_by(BudgetTransaction.date)
    )
    return list(db.scalars(stmt).all())
