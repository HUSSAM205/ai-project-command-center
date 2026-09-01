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


def list_all_transactions_for_org(db: Session, organization_id: UUID) -> list[BudgetTransaction]:
    """All budget_transactions across every project in the org, joined through Project the
    same way every other *_for_org repository function scopes tenancy. Used by Analytics
    (portfolio-wide burn-rate trend) and by the Reports endpoints."""
    stmt = (
        select(BudgetTransaction)
        .join(Project, BudgetTransaction.project_id == Project.id)
        .where(Project.organization_id == organization_id)
        .order_by(BudgetTransaction.date)
    )
    return list(db.scalars(stmt).all())
