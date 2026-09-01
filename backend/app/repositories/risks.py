from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.project import Project
from app.models.risk import Risk


def list_risks_for_project(db: Session, organization_id: UUID, project_id: UUID) -> list[Risk]:
    stmt = (
        select(Risk)
        .join(Project, Risk.project_id == Project.id)
        .where(Project.organization_id == organization_id, Project.id == project_id)
    )
    return list(db.scalars(stmt).all())


def get_risk(db: Session, organization_id: UUID, risk_id: UUID) -> Risk | None:
    stmt = (
        select(Risk)
        .join(Project, Risk.project_id == Project.id)
        .where(Project.organization_id == organization_id, Risk.id == risk_id)
    )
    return db.scalar(stmt)


def list_all_risks_for_org(db: Session, organization_id: UUID) -> list[Risk]:
    stmt = select(Risk).join(Project, Risk.project_id == Project.id).where(
        Project.organization_id == organization_id
    )
    return list(db.scalars(stmt).all())
