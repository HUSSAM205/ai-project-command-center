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
    # Real financial burn: logged_hours/planned_hours are sums of Task.actual_hours/estimated_hours
    # across every task assigned to this resource (see app/api/resources.py's list_all_resources).
    # cost_burn/planned_cost = those hours * this resource's own hourly_cost -- a real per-person
    # labor-cost variance signal, not a fabricated one. Defaults to 0 for a just-created/updated
    # resource (create_resource/update_resource below don't have task history to compute from yet).
    logged_hours: float = 0.0
    planned_hours: float = 0.0
    cost_burn: MoneyField = Decimal("0")
    planned_cost: MoneyField = Decimal("0")


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


class ResourceMatrixCellOut(BaseModel):
    project_id: UUID
    project_name: str
    allocation_percent: int
    is_single_point_of_failure: bool


class ResourceMatrixRowOut(BaseModel):
    resource_id: UUID
    resource_name: str
    role: str | None
    utilization_state: UtilizationState
    workload_hours: float
    capacity_hours: float
    allocations: list[ResourceMatrixCellOut]


class BalanceSuggestionOut(BaseModel):
    task_id: UUID
    task_title: str
    from_resource_id: UUID
    from_resource_name: str
    from_utilization_pct: float
    to_resource_id: UUID
    to_resource_name: str
    to_utilization_pct_before: float
    to_utilization_pct_after: float
    explanation: str
