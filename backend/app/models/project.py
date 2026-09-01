import uuid
from datetime import date

from sqlalchemy import Date, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin
from app.models.enums import Priority, ProjectStatus


class Project(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "projects"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    client: Mapped[str | None] = mapped_column(String(255), nullable=True)
    manager_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[ProjectStatus] = mapped_column(
        Enum(ProjectStatus, name="project_status", native_enum=True),
        nullable=False,
        default=ProjectStatus.PLANNING,
    )
    priority: Mapped[Priority] = mapped_column(
        Enum(Priority, name="priority", native_enum=True), nullable=False, default=Priority.MEDIUM
    )
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    budget: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    actual_cost: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # NOTE: health_score and risk_level are intentionally NOT persisted columns —
    # per PRODUCT_REQUIREMENTS.md they are computed on read by app/services/health_score.py
    # and never stored as source of truth.

    tasks: Mapped[list["Task"]] = relationship(  # noqa: F821
        back_populates="project", cascade="all, delete-orphan"
    )
    milestones: Mapped[list["Milestone"]] = relationship(  # noqa: F821
        back_populates="project", cascade="all, delete-orphan"
    )
    risks: Mapped[list["Risk"]] = relationship(  # noqa: F821
        back_populates="project", cascade="all, delete-orphan"
    )
    members: Mapped[list["ProjectMember"]] = relationship(  # noqa: F821
        back_populates="project", cascade="all, delete-orphan"
    )
    allocations: Mapped[list["ResourceAllocation"]] = relationship(  # noqa: F821
        back_populates="project", cascade="all, delete-orphan"
    )
    budget_record: Mapped["Budget | None"] = relationship(  # noqa: F821
        back_populates="project", cascade="all, delete-orphan", uselist=False
    )
    budget_transactions: Mapped[list["BudgetTransaction"]] = relationship(  # noqa: F821
        back_populates="project", cascade="all, delete-orphan"
    )
    manager: Mapped["User | None"] = relationship(  # noqa: F821
        foreign_keys=[manager_id], viewonly=True
    )

    @property
    def manager_name(self) -> str | None:
        return self.manager.full_name if self.manager else None


class ProjectMember(UUIDPKMixin, Base):
    __tablename__ = "project_members"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role_on_project: Mapped[str | None] = mapped_column(String(255), nullable=True)

    project: Mapped["Project"] = relationship(back_populates="members")
