from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import RoadmapPhaseType
from app.schemas.ai import AISource
from app.schemas.common import MoneyField


class BusinessCaseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    business_problem: str = Field(min_length=1)
    current_state: str = Field(min_length=1)
    desired_state: str = Field(min_length=1)
    objectives: str = Field(min_length=1)
    constraints: str | None = None
    stakeholders: str | None = None
    budget: Decimal = Decimal("0")
    timeline: str | None = None


class BusinessCaseUpdate(BaseModel):
    name: str | None = None
    business_problem: str | None = None
    current_state: str | None = None
    desired_state: str | None = None
    objectives: str | None = None
    constraints: str | None = None
    stakeholders: str | None = None
    budget: Decimal | None = None
    timeline: str | None = None


class BusinessCaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    name: str
    business_problem: str
    current_state: str
    desired_state: str
    objectives: str
    constraints: str | None
    stakeholders: str | None
    budget: MoneyField
    timeline: str | None
    created_by: UUID | None
    created_at: datetime


class AIOpportunityCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    business_impact: int = Field(ge=1, le=5)
    feasibility: int = Field(ge=1, le=5)
    data_readiness: int = Field(ge=1, le=5)
    cost: int = Field(ge=1, le=5)
    time_to_value: int = Field(ge=1, le=5)
    risk: int = Field(ge=1, le=5)


class AIOpportunityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    business_case_id: UUID
    name: str
    description: str | None
    business_impact: int
    feasibility: int
    data_readiness: int
    cost: int
    time_to_value: int
    risk: int
    overall_score: int
    score_breakdown: dict[str, float]
    created_at: datetime


class ROIRequest(BaseModel):
    current_cost: Decimal = Field(ge=0)
    implementation_cost: Decimal = Field(ge=0)
    expected_efficiency_gain: Decimal = Field(ge=0, le=100)
    annual_savings: Decimal = Field(ge=0)
    maintenance_cost: Decimal = Field(ge=0)


class ROIOut(BaseModel):
    business_case_id: UUID
    current_cost: MoneyField
    implementation_cost: MoneyField
    expected_efficiency_gain: float
    annual_savings: MoneyField
    maintenance_cost: MoneyField
    efficiency_savings: float
    annual_benefit: float
    net_benefit: float
    roi_percent: float | None
    payback_period_months: float | None
    formula: str


class RoadmapPhaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    business_case_id: UUID
    phase: RoadmapPhaseType
    objectives: list[str]
    deliverables: list[str]
    kpis: list[str]
    risks: list[str]
    duration_weeks: int
    resources: list[str]
    budget: MoneyField
    sequence_order: int
    source: AISource
