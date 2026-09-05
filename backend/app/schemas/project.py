from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import Priority, ProjectStatus, RagStatus, RiskLevel
from app.schemas.common import MoneyField


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    client: str | None = None
    manager_id: UUID | None = None
    status: ProjectStatus = ProjectStatus.PLANNING
    priority: Priority = Priority.MEDIUM
    start_date: date | None = None
    end_date: date | None = None
    budget: Decimal = Decimal("0")
    actual_cost: Decimal = Decimal("0")
    progress: int = Field(default=0, ge=0, le=100)


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    client: str | None = None
    manager_id: UUID | None = None
    status: ProjectStatus | None = None
    priority: Priority | None = None
    start_date: date | None = None
    end_date: date | None = None
    budget: Decimal | None = None
    actual_cost: Decimal | None = None
    progress: int | None = Field(default=None, ge=0, le=100)


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    name: str
    description: str | None
    client: str | None
    manager_id: UUID | None
    manager_name: str | None = None
    status: ProjectStatus
    priority: Priority
    start_date: date | None
    end_date: date | None
    budget: MoneyField
    actual_cost: MoneyField
    progress: int
    health_score: int
    risk_level: RiskLevel
    rag_status: RagStatus
    created_at: datetime
    updated_at: datetime


class HealthScoreOut(BaseModel):
    project_id: UUID
    health_score: int
    risk_level: RiskLevel
    planned_pct: float
    avg_task_completion: float
    # Flattened per-component penalties (frontend contract) ...
    schedule_penalty: float
    budget_penalty: float
    task_penalty: float
    risk_penalty: float
    resource_penalty: float
    dependency_penalty: float
    total_penalty: float
    # ... plus the same values nested, for callers that prefer a single breakdown object.
    breakdown: dict[str, float]


class CostForecastOut(BaseModel):
    project_id: UUID
    budget: MoneyField
    actual_cost: MoneyField
    forecasted_final_cost: float
    variance: float
    variance_percent: float
    overrun_probability: float
    method: str
    cpi: float | None
    earned_value: float | None


class MonteCarloForecastOut(BaseModel):
    project_id: UUID
    p50_date: date
    p85_date: date
    p95_date: date
    remaining_task_count: int
    remaining_hours_estimate: float
    weekly_capacity_hours: float
    historical_sample_size: int
    method: str
    runs: int
