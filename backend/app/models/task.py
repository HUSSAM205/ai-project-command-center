import uuid
from datetime import date

from sqlalchemy import ARRAY, Date, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin
from app.models.enums import Priority, TaskStatus


class Task(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "tasks"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("resources.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus, name="task_status", native_enum=True), nullable=False, default=TaskStatus.TODO
    )
    priority: Mapped[Priority] = mapped_column(
        Enum(Priority, name="priority", native_enum=True, create_type=False),
        nullable=False,
        default=Priority.MEDIUM,
    )
    estimated_hours: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    actual_hours: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    completion_percentage: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    required_skills: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)

    project: Mapped["Project"] = relationship(back_populates="tasks")  # noqa: F821
    assignee: Mapped["Resource | None"] = relationship(  # noqa: F821
        foreign_keys=[assignee_id], viewonly=True
    )

    @property
    def assignee_name(self) -> str | None:
        return self.assignee.name if self.assignee else None
    dependencies: Mapped[list["TaskDependency"]] = relationship(
        foreign_keys="TaskDependency.task_id",
        back_populates="task",
        cascade="all, delete-orphan",
    )


class TaskDependency(UUIDPKMixin, Base):
    __tablename__ = "task_dependencies"

    task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    depends_on_task_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True
    )

    task: Mapped["Task"] = relationship(foreign_keys=[task_id], back_populates="dependencies")
