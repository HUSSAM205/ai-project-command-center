import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import UUIDPKMixin
from app.models.enums import AutomationActionType, AutomationOutcome, AutomationTriggerType


class AutomationRule(UUIDPKMixin, Base):
    """A configured automation rule. This deployment has no background job scheduler (see
    app/services/automation_engine.py's module docstring for the full reasoning) -- a rule's
    condition is evaluated for real, against real current data, either lazily and opportunistically
    (once per org per cooldown window, piggybacked on GET /notifications, the same
    "reconcile on a hot read path instead of a scheduler" convention this app already uses for
    stuck document processing) or explicitly on demand (POST /automations/{id}/test-run). Never a
    literally-continuous watcher -- and never fabricated as one in the UI copy either."""

    __tablename__ = "automation_rules"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    trigger_type: Mapped[AutomationTriggerType] = mapped_column(
        Enum(AutomationTriggerType, name="automation_trigger_type", native_enum=True), nullable=False
    )
    condition_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    action_type: Mapped[AutomationActionType] = mapped_column(
        Enum(AutomationActionType, name="automation_action_type", native_enum=True), nullable=False
    )
    action_params_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AutomationLog(UUIDPKMixin, Base):
    """One row per real rule evaluation (fired or not) -- the Execution Audit Log the frontend's
    drawer reads. Every evaluation is logged, not just the ones that fired, so "this rule hasn't
    done anything yet" is a visible, honest fact rather than an empty log indistinguishable from
    "never checked"."""

    __tablename__ = "automation_logs"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("automation_rules.id", ondelete="CASCADE"), nullable=False, index=True
    )
    triggered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    outcome: Mapped[AutomationOutcome] = mapped_column(
        Enum(AutomationOutcome, name="automation_outcome", native_enum=True), nullable=False
    )
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    entity_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
