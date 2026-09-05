from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import UserRole


class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    full_name: str
    role: UserRole
    created_at: datetime


class AdminOrganizationOut(BaseModel):
    """Deliberately not a cross-tenant list — an admin is still scoped to their own
    organization_id, so this is just "your own org's details" plus a couple of counts."""

    id: UUID
    name: str
    slug: str
    is_demo: bool
    created_at: datetime
    user_count: int
    project_count: int


class AIProviderStatusOut(BaseModel):
    """Live status read directly from the process-wide AIRouter singleton (app/ai/router.py)
    — never fabricated. `demo_ai` has no API key / circuit breaker; it's the unconditional
    final fallback, so it is always available."""

    name: str
    configured: bool
    available: bool
    circuit_open: bool
    consecutive_failures: int
    cooldown_seconds_remaining: float | None = None


class AIUsageProviderBreakdown(BaseModel):
    provider: str
    request_count: int
    success_rate: float
    avg_latency_ms: float


class AIUsageOut(BaseModel):
    window_hours: int
    since: datetime
    total_requests: int
    success_rate: float
    avg_latency_ms: float
    provider_breakdown: list[AIUsageProviderBreakdown]


class AuditLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    actor_user_id: UUID | None
    action: str
    entity_type: str
    entity_id: UUID | None
    event_metadata: dict[str, Any]
    session_id: str | None = None
    actor_email: str | None = None
    ip_address: str | None = None
    record_hash: str | None = None
    prev_hash: str | None = None
    created_at: datetime


class AuditLogPage(BaseModel):
    items: list[AuditLogOut]
    total: int
    page: int
    page_size: int


class FeedbackOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    user_id: UUID | None
    message: str
    created_at: datetime


class FeedbackPage(BaseModel):
    items: list[FeedbackOut]
    total: int
    page: int
    page_size: int


class FeedbackCreate(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
