from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import Priority
from app.schemas.task import TaskOut


class MeetingParseRequest(BaseModel):
    transcript: str = Field(min_length=1, max_length=50_000)


class MeetingActionItemIn(BaseModel):
    """One action item as approved/edited by the caller in the Meeting Workbench UI -- the same
    shape AIResponse.data["action_items"] returns from POST /meetings/parse-transcript, sent back
    verbatim (or edited) to actually create the task."""

    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    owner_name: str | None = None
    priority: Priority = Priority.MEDIUM
    due_date: date | None = None
    estimated_hours: Decimal | None = None


class MeetingCommitRequest(BaseModel):
    project_id: UUID
    action_items: list[MeetingActionItemIn] = Field(min_length=1)


class MeetingCommitResponse(BaseModel):
    """created_tasks are real, persisted Task rows. unresolved_owners lists any owner_name that
    could not be matched to exactly one real Resource in this org -- those tasks are created
    unassigned rather than guessing wrong, and the caller should surface this honestly rather
    than implying every owner was matched."""

    created_tasks: list[TaskOut]
    unresolved_owners: list[str]
