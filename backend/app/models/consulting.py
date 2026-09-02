"""AI Consulting Workspace (Phase 4) — a strategy/business-case tool distinct from the
project-management domain elsewhere in this app. See docs/PRODUCT_REQUIREMENTS.md §35-38 and
app/services/opportunity_scoring.py, app/services/roi_calculator.py,
app/services/transformation_roadmap.py for the transparent, deterministic formulas that back
these tables — only phase narrative content (objectives/deliverables/kpis/risks on
RoadmapPhase) is AI-generated, via app.ai.router.AIRouter, same as the rest of the app.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import UUIDPKMixin
from app.models.enums import RoadmapPhaseType


class BusinessCase(UUIDPKMixin, Base):
    __tablename__ = "business_cases"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Intake fields (spec §35) — all free text captured verbatim from the consultant's intake
    # form. These are the ONLY inputs the roadmap generator's AI narrative is grounded in
    # (see app/ai/context.py::build_roadmap_phase_document) — never fabricated elsewhere.
    business_problem: Mapped[str] = mapped_column(Text, nullable=False)
    current_state: Mapped[str] = mapped_column(Text, nullable=False)
    desired_state: Mapped[str] = mapped_column(Text, nullable=False)
    objectives: Mapped[str] = mapped_column(Text, nullable=False)
    constraints: Mapped[str | None] = mapped_column(Text, nullable=True)
    stakeholders: Mapped[str | None] = mapped_column(Text, nullable=True)
    budget: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    # Free text on purpose ("Q1-Q3 2026", "6 months", "12 weeks") — no assumption the
    # consultant enters a parseable duration; app/services/transformation_roadmap.py falls
    # back to a documented default total program length when it can't parse one.
    timeline: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    opportunities: Mapped[list["AIOpportunity"]] = relationship(
        back_populates="business_case", cascade="all, delete-orphan"
    )
    roadmap_phases: Mapped[list["RoadmapPhase"]] = relationship(
        back_populates="business_case",
        cascade="all, delete-orphan",
        order_by="RoadmapPhase.sequence_order",
    )


class AIOpportunity(UUIDPKMixin, Base):
    """A scored AI/automation use-case candidate under a business case (spec §36).

    `overall_score` is intentionally NOT persisted — computed on read by
    app/services/opportunity_scoring.py, the same "never store a derived score as source of
    truth" discipline used by Risk.score and Project.health_score elsewhere in this app.
    """

    __tablename__ = "ai_opportunities"
    __table_args__ = (
        CheckConstraint("business_impact BETWEEN 1 AND 5", name="ck_ai_opportunities_business_impact_range"),
        CheckConstraint("feasibility BETWEEN 1 AND 5", name="ck_ai_opportunities_feasibility_range"),
        CheckConstraint("data_readiness BETWEEN 1 AND 5", name="ck_ai_opportunities_data_readiness_range"),
        CheckConstraint("cost BETWEEN 1 AND 5", name="ck_ai_opportunities_cost_range"),
        CheckConstraint("time_to_value BETWEEN 1 AND 5", name="ck_ai_opportunities_time_to_value_range"),
        CheckConstraint("risk BETWEEN 1 AND 5", name="ck_ai_opportunities_risk_range"),
    )

    business_case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("business_cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # All six dimensions are 1-5 consultant-entered scores — see the docstring in
    # app/services/opportunity_scoring.py for the exact semantics of each and which
    # direction ("higher is better" vs "higher is worse") applies to each one.
    business_impact: Mapped[int] = mapped_column(Integer, nullable=False)
    feasibility: Mapped[int] = mapped_column(Integer, nullable=False)
    data_readiness: Mapped[int] = mapped_column(Integer, nullable=False)
    cost: Mapped[int] = mapped_column(Integer, nullable=False)
    time_to_value: Mapped[int] = mapped_column(Integer, nullable=False)
    risk: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    business_case: Mapped["BusinessCase"] = relationship(back_populates="opportunities")


class RoadmapPhase(UUIDPKMixin, Base):
    """One of the 5 fixed transformation-roadmap phases for a business case (spec §37).

    `duration_weeks`/`budget`/`resources` are deterministic scaffold values from
    app/services/transformation_roadmap.py. `objectives`/`deliverables`/`kpis`/`risks` are the
    AI-generated narrative content (via AIRouter.analyze_document, grounded in this business
    case's real intake + scored opportunities — see app/ai/context.py); `source` persists
    AIResponse.source so the UI can render an honest AISourceBadge without re-calling AI.
    """

    __tablename__ = "roadmap_phases"

    business_case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("business_cases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    phase: Mapped[RoadmapPhaseType] = mapped_column(
        Enum(RoadmapPhaseType, name="roadmap_phase_type", native_enum=True), nullable=False
    )
    objectives: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    deliverables: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    kpis: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    risks: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    duration_weeks: Mapped[int] = mapped_column(Integer, nullable=False)
    resources: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    budget: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    sequence_order: Mapped[int] = mapped_column(Integer, nullable=False)
    # "gemini" | "groq" | "cache" | "demo_ai" — mirrors AIResponse.source (app/schemas/ai.py).
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="demo_ai")

    business_case: Mapped["BusinessCase"] = relationship(back_populates="roadmap_phases")
