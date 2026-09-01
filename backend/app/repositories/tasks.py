"""Tasks have no organization_id column — they are scoped via their parent project's
organization_id, joined on every query so a task can never be read/written cross-tenant."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.project import Project
from app.models.task import Task, TaskDependency


def list_tasks_for_project(db: Session, organization_id: UUID, project_id: UUID) -> list[Task]:
    stmt = (
        select(Task)
        .join(Project, Task.project_id == Project.id)
        .where(Project.organization_id == organization_id, Project.id == project_id)
        .order_by(Task.created_at)
    )
    return list(db.scalars(stmt).all())


def get_task(db: Session, organization_id: UUID, task_id: UUID) -> Task | None:
    stmt = (
        select(Task)
        .join(Project, Task.project_id == Project.id)
        .where(Project.organization_id == organization_id, Task.id == task_id)
    )
    return db.scalar(stmt)


def list_all_tasks_for_org(db: Session, organization_id: UUID) -> list[Task]:
    stmt = select(Task).join(Project, Task.project_id == Project.id).where(
        Project.organization_id == organization_id
    )
    return list(db.scalars(stmt).all())


def get_dependency(db: Session, organization_id: UUID, dependency_id: UUID) -> TaskDependency | None:
    stmt = (
        select(TaskDependency)
        .join(Task, TaskDependency.task_id == Task.id)
        .join(Project, Task.project_id == Project.id)
        .where(Project.organization_id == organization_id, TaskDependency.id == dependency_id)
    )
    return db.scalar(stmt)
