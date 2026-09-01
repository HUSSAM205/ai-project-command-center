"""All queries here are org-scoped by `organization_id` taken from the caller's JWT.
Never accept an organization id from client input."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.project import Project


def list_projects(db: Session, organization_id: UUID) -> list[Project]:
    stmt = select(Project).where(Project.organization_id == organization_id).order_by(Project.created_at)
    return list(db.scalars(stmt).all())


def get_project(db: Session, organization_id: UUID, project_id: UUID) -> Project | None:
    stmt = select(Project).where(Project.organization_id == organization_id, Project.id == project_id)
    return db.scalar(stmt)
