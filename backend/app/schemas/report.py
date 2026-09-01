from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.ai import AISource

ReportType = Literal["status", "executive", "risk", "budget", "ai_transformation", "weekly"]

REPORT_TITLES: dict[str, str] = {
    "status": "Status Report",
    "executive": "Executive Summary Report",
    "risk": "Risk Report",
    "budget": "Budget Report",
    "ai_transformation": "AI Transformation Report",
    "weekly": "Weekly Report",
}


class ReportSection(BaseModel):
    heading: str
    body: str
    data: dict[str, Any] | None = None


class ReportOut(BaseModel):
    """Structured, print-friendly report body. `source` is the same honest AI-provenance
    label as AIResponse.source — every report includes exactly one AI-generated narrative
    section, and this field says where that narrative actually came from (demo_ai vs a
    live provider vs cache), never implying a live model ran when it didn't."""

    report_type: ReportType
    title: str
    generated_at: datetime
    organization_name: str
    project_id: UUID | None = None
    project_name: str | None = None
    source: AISource
    sections: list[ReportSection] = Field(default_factory=list)
