import uuid
from datetime import date

from sqlalchemy import ARRAY, Date, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import UUIDPKMixin


class Resource(UUIDPKMixin, Base):
    __tablename__ = "resources"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str | None] = mapped_column(String(255), nullable=True)
    department: Mapped[str | None] = mapped_column(String(255), nullable=True)
    skills: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    hourly_cost: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    capacity_hours_per_week: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False, default=40)

    # current_workload_hours_per_week and utilization_state are intentionally NOT persisted —
    # per PRODUCT_REQUIREMENTS.md they are derived on read from active resource_allocations.

    allocations: Mapped[list["ResourceAllocation"]] = relationship(
        back_populates="resource", cascade="all, delete-orphan"
    )


class ResourceAllocation(UUIDPKMixin, Base):
    __tablename__ = "resource_allocations"

    resource_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("resources.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    allocation_percent: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    resource: Mapped["Resource"] = relationship(back_populates="allocations")
    project: Mapped["Project"] = relationship(back_populates="allocations")  # noqa: F821
