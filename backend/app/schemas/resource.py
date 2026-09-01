from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import UtilizationState
from app.schemas.common import MoneyField


class ResourceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    role: str | None = None
    department: str | None = None
    skills: list[str] | None = None
    hourly_cost: Decimal = Decimal("0")
    capacity_hours_per_week: Decimal = Decimal("40")


class ResourceUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    department: str | None = None
    skills: list[str] | None = None
    hourly_cost: Decimal | None = None
    capacity_hours_per_week: Decimal | None = None


class ResourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    name: str
    role: str | None
    department: str | None
    skills: list[str] | None
    hourly_cost: MoneyField
    capacity_hours_per_week: MoneyField
    current_workload_hours_per_week: float
    utilization_state: UtilizationState


class ResourceAllocationCreate(BaseModel):
    resource_id: UUID
    allocation_percent: int = Field(ge=0, le=100)
    start_date: date | None = None
    end_date: date | None = None


class ResourceAllocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    resource_id: UUID
    project_id: UUID
    allocation_percent: int
    start_date: date | None
    end_date: date | None
