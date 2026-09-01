from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import MilestoneStatus


class MilestoneCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    due_date: date | None = None
    status: MilestoneStatus = MilestoneStatus.PENDING


class MilestoneUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    due_date: date | None = None
    status: MilestoneStatus | None = None


class MilestoneOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    name: str
    description: str | None
    due_date: date | None
    status: MilestoneStatus
