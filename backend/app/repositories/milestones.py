from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.milestone import Milestone
from app.models.project import Project


def list_milestones_for_project(db: Session, organization_id: UUID, project_id: UUID) -> list[Milestone]:
    stmt = (
        select(Milestone)
        .join(Project, Milestone.project_id == Project.id)
        .where(Project.organization_id == organization_id, Project.id == project_id)
        .order_by(Milestone.due_date)
    )
    return list(db.scalars(stmt).all())


def list_all_milestones_for_org(db: Session, organization_id: UUID) -> list[Milestone]:
    stmt = select(Milestone).join(Project, Milestone.project_id == Project.id).where(
        Project.organization_id == organization_id
    )
    return list(db.scalars(stmt).all())


def get_milestone(db: Session, organization_id: UUID, milestone_id: UUID) -> Milestone | None:
    stmt = (
        select(Milestone)
        .join(Project, Milestone.project_id == Project.id)
        .where(Project.organization_id == organization_id, Milestone.id == milestone_id)
    )
    return db.scalar(stmt)
