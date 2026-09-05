from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.enums import AutomationActionType, AutomationOutcome, AutomationTriggerType


class AutomationRuleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    trigger_type: AutomationTriggerType
    condition_json: dict[str, Any]
    action_type: AutomationActionType
    action_params_json: dict[str, Any]
    is_active: bool
    last_triggered_at: datetime | None


class AutomationLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    rule_id: UUID
    triggered_at: datetime
    outcome: AutomationOutcome
    detail: str | None
    entity_type: str | None
    entity_id: UUID | None
