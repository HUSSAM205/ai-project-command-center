from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.project import Project
from app.models.resource import Resource, ResourceAllocation


def list_resources(db: Session, organization_id: UUID) -> list[Resource]:
    stmt = select(Resource).where(Resource.organization_id == organization_id).order_by(Resource.name)
    return list(db.scalars(stmt).all())


def get_resource(db: Session, organization_id: UUID, resource_id: UUID) -> Resource | None:
    stmt = select(Resource).where(Resource.organization_id == organization_id, Resource.id == resource_id)
    return db.scalar(stmt)


def list_allocations_for_org(db: Session, organization_id: UUID) -> list[ResourceAllocation]:
    stmt = select(ResourceAllocation).join(Resource, ResourceAllocation.resource_id == Resource.id).where(
        Resource.organization_id == organization_id
    )
    return list(db.scalars(stmt).all())


def list_allocations_for_project(db: Session, organization_id: UUID, project_id: UUID) -> list[ResourceAllocation]:
    stmt = (
        select(ResourceAllocation)
        .join(Project, ResourceAllocation.project_id == Project.id)
        .where(Project.organization_id == organization_id, ResourceAllocation.project_id == project_id)
    )
    return list(db.scalars(stmt).all())
