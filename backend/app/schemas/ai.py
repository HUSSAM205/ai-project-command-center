from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

# "cache" means a previously-cached live-provider response was served (still an honest,
# real answer — just not freshly generated); "demo_ai" means no live provider ran at all.
AISource = Literal["gemini", "groq", "cache", "demo_ai"]


class AIResponse(BaseModel):
    """Canonical response shape for every AI-touching endpoint. `source` is always present
    and honest, so the frontend can label output correctly (e.g. a "Demo AI" badge vs a
    live-provider badge) — the API must never imply a live model ran when it didn't."""

    summary: str
    confidence: float = Field(ge=0, le=1)
    source: AISource
    detail: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)
    prompt_version: str | None = None


class AssistantRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    project_id: UUID | None = None
