"""All queries here are org-scoped by `organization_id` taken from the caller's JWT.
Never accept an organization id from client input."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.project import Project


def list_projects(db: Session, organization_id: UUID) -> list[Project]:
    stmt = select(Project).where(Project.organization_id == organization_id).order_by(Project.created_at)
    return list(db.scalars(stmt).all())


def list_projects_for_portfolio(db: Session, organization_id: UUID) -> list[Project]:
    """Same rows as list_projects, but eager-loads tasks/risks/allocations via selectinload so a
    caller that needs every project's relational data (GET /projects, which computes a health
    score and overloaded-resource count per project) issues a fixed small number of queries
    instead of 3 extra queries per project -- the N+1 that made this endpoint's latency scale
    with project count once the portfolio grew past a handful of seeded projects."""
    stmt = (
        select(Project)
        .where(Project.organization_id == organization_id)
        .order_by(Project.created_at)
        .options(selectinload(Project.tasks), selectinload(Project.risks), selectinload(Project.allocations))
    )
    return list(db.scalars(stmt).all())


def get_project(db: Session, organization_id: UUID, project_id: UUID) -> Project | None:
    stmt = select(Project).where(Project.organization_id == organization_id, Project.id == project_id)
    return db.scalar(stmt)
