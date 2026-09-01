from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import RiskCategory, RiskSeverity, RiskStatus


class RiskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    category: RiskCategory
    probability: int = Field(ge=1, le=5)
    impact: int = Field(ge=1, le=5)
    owner: str | None = None
    mitigation: str | None = None
    status: RiskStatus = RiskStatus.OPEN


class RiskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    category: RiskCategory | None = None
    probability: int | None = Field(default=None, ge=1, le=5)
    impact: int | None = Field(default=None, ge=1, le=5)
    owner: str | None = None
    mitigation: str | None = None
    status: RiskStatus | None = None


class RiskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    title: str
    description: str | None
    category: RiskCategory
    probability: int
    impact: int
    score: int
    severity: RiskSeverity
    owner: str | None
    mitigation: str | None
    status: RiskStatus
