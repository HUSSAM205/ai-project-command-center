from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import Priority, TaskStatus
from app.schemas.common import MoneyField


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    assignee_id: UUID | None = None
    status: TaskStatus = TaskStatus.TODO
    priority: Priority = Priority.MEDIUM
    estimated_hours: Decimal | None = None
    actual_hours: Decimal | None = None
    start_date: date | None = None
    due_date: date | None = None
    completion_percentage: int = Field(default=0, ge=0, le=100)
    required_skills: list[str] | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    assignee_id: UUID | None = None
    status: TaskStatus | None = None
    priority: Priority | None = None
    estimated_hours: Decimal | None = None
    actual_hours: Decimal | None = None
    start_date: date | None = None
    due_date: date | None = None
    completion_percentage: int | None = Field(default=None, ge=0, le=100)
    required_skills: list[str] | None = None


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    title: str
    description: str | None
    assignee_id: UUID | None
    assignee_name: str | None = None
    status: TaskStatus
    priority: Priority
    estimated_hours: MoneyField | None
    actual_hours: MoneyField | None
    start_date: date | None
    due_date: date | None
    completion_percentage: int
    required_skills: list[str] | None
    created_at: datetime
    updated_at: datetime


class TaskDependencyCreate(BaseModel):
    depends_on_task_id: UUID


class TaskDependencyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    task_id: UUID
    depends_on_task_id: UUID


class SuggestAssigneesRequest(BaseModel):
    limit: int = Field(default=5, ge=1, le=50)


class CandidateOut(BaseModel):
    resource_id: UUID
    resource_name: str
    skill_match_pct: float
    availability_pct: float
    cost_score: float
    overall: float
    explanation: str
