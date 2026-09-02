"""AI Consulting Workspace (Phase 4) — a strategy/business-case tool distinct from the
project-management domain elsewhere in this app: business case intake, 6-dimension opportunity
scoring, an impact-vs-feasibility priority matrix (computed client-side from the opportunities
list, same as RiskMatrix does for risks — no separate matrix endpoint), a pure-formula ROI
calculator, and an AI-narrated transformation roadmap generator.

Scoring (opportunity_scoring.py) and the ROI formula (roi_calculator.py) are deterministic —
never AI-generated, per this project's spec. Only roadmap phase narrative content (objectives/
deliverables/KPIs/risks) goes through AIRouter, reusing the existing `analyze_document` method
and dispatch pattern (see app/api/documents.py, app/api/reports.py) rather than a parallel path.
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.ai.context import build_roadmap_phase_document
from app.ai.router import AIRouter as AIOrchestrator
from app.ai.router import get_ai_router
from app.api.serializers import serialize_opportunity
from app.core.database import get_db
from app.core.deps import CurrentPrincipal, get_current_principal, require_write_access
from app.models.consulting import AIOpportunity, BusinessCase, RoadmapPhase
from app.repositories.consulting import (
    delete_roadmap_phases_for_case,
    get_business_case,
    list_business_cases,
    list_opportunities_for_case,
    list_roadmap_phases_for_case,
)
from app.schemas.consulting import (
    AIOpportunityCreate,
    AIOpportunityOut,
    BusinessCaseCreate,
    BusinessCaseOut,
    BusinessCaseUpdate,
    ROIOut,
    ROIRequest,
    RoadmapPhaseOut,
)
from app.services.document_extraction import extract_structured_document_info
from app.services.opportunity_scoring import compute_opportunity_score
from app.services.roi_calculator import compute_roi
from app.services.transformation_roadmap import build_phase_scaffold

router = APIRouter(prefix="/api/v1/consulting", tags=["consulting"])


def _scope_key(principal: CurrentPrincipal) -> str:
    return f"{principal.organization_id}:{principal.user_id}"


def _created_by(principal: CurrentPrincipal) -> UUID | None:
    try:
        return UUID(principal.user_id)
    except (ValueError, TypeError):
        # Anonymous/demo sessions carry a non-UUID sentinel ("demo") — never a real user row.
        return None


def _get_case_or_404(db: Session, principal: CurrentPrincipal, business_case_id: UUID) -> BusinessCase:
    case = get_business_case(db, principal.organization_id, business_case_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="business case not found")
    return case


# ---- Business Cases (CRUD) ----


@router.post("/business-cases", response_model=BusinessCaseOut, status_code=status.HTTP_201_CREATED)
def create_business_case(
    payload: BusinessCaseCreate,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> BusinessCaseOut:
    case = BusinessCase(
        organization_id=principal.organization_id,
        created_by=_created_by(principal),
        **payload.model_dump(),
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return BusinessCaseOut.model_validate(case)


@router.get("/business-cases", response_model=list[BusinessCaseOut])
def list_business_cases_endpoint(
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> list[BusinessCaseOut]:
    cases = list_business_cases(db, principal.organization_id)
    return [BusinessCaseOut.model_validate(c) for c in cases]


@router.get("/business-cases/{business_case_id}", response_model=BusinessCaseOut)
def get_business_case_endpoint(
    business_case_id: UUID,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> BusinessCaseOut:
    case = _get_case_or_404(db, principal, business_case_id)
    return BusinessCaseOut.model_validate(case)


@router.patch("/business-cases/{business_case_id}", response_model=BusinessCaseOut)
def update_business_case(
    business_case_id: UUID,
    payload: BusinessCaseUpdate,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> BusinessCaseOut:
    case = _get_case_or_404(db, principal, business_case_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(case, field, value)
    db.commit()
    db.refresh(case)
    return BusinessCaseOut.model_validate(case)


@router.delete("/business-cases/{business_case_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_business_case(
    business_case_id: UUID,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> None:
    case = _get_case_or_404(db, principal, business_case_id)
    db.delete(case)
    db.commit()


# ---- Opportunities (deterministic 6-dimension scoring, spec §36) ----


@router.post(
    "/business-cases/{business_case_id}/opportunities",
    response_model=AIOpportunityOut,
    status_code=status.HTTP_201_CREATED,
)
def create_opportunity(
    business_case_id: UUID,
    payload: AIOpportunityCreate,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> AIOpportunityOut:
    _get_case_or_404(db, principal, business_case_id)
    opportunity = AIOpportunity(business_case_id=business_case_id, **payload.model_dump())
    db.add(opportunity)
    db.commit()
    db.refresh(opportunity)
    return serialize_opportunity(opportunity)


@router.get("/business-cases/{business_case_id}/opportunities", response_model=list[AIOpportunityOut])
def list_opportunities(
    business_case_id: UUID,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> list[AIOpportunityOut]:
    _get_case_or_404(db, principal, business_case_id)
    opportunities = list_opportunities_for_case(db, principal.organization_id, business_case_id)
    scored = [serialize_opportunity(o) for o in opportunities]
    scored.sort(key=lambda o: o.overall_score, reverse=True)
    return scored


# ---- ROI Calculator (pure formula, spec §38) ----


@router.post("/business-cases/{business_case_id}/roi", response_model=ROIOut)
def calculate_roi(
    business_case_id: UUID,
    payload: ROIRequest,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> ROIOut:
    """Pure deterministic calculation — no persistence, no AI. Open to demo/read-only sessions
    (like GET /ai/executive-brief and the other read/compute endpoints) because it never
    mutates data; it just evaluates the spec §38 formula against the request body."""
    case = _get_case_or_404(db, principal, business_case_id)
    result = compute_roi(
        current_cost=float(payload.current_cost),
        implementation_cost=float(payload.implementation_cost),
        expected_efficiency_gain=float(payload.expected_efficiency_gain),
        annual_savings=float(payload.annual_savings),
        maintenance_cost=float(payload.maintenance_cost),
    )
    return ROIOut(
        business_case_id=case.id,
        current_cost=payload.current_cost,
        implementation_cost=payload.implementation_cost,
        expected_efficiency_gain=float(payload.expected_efficiency_gain),
        annual_savings=payload.annual_savings,
        maintenance_cost=payload.maintenance_cost,
        efficiency_savings=result.efficiency_savings,
        annual_benefit=result.annual_benefit,
        net_benefit=result.net_benefit,
        roi_percent=result.roi_percent,
        payback_period_months=result.payback_period_months,
        formula=result.formula,
    )


# ---- Transformation Roadmap generator (spec §37) ----


@router.post("/business-cases/{business_case_id}/roadmap", response_model=list[RoadmapPhaseOut])
def generate_roadmap(
    business_case_id: UUID,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
    ai_router: AIOrchestrator = Depends(get_ai_router),
) -> list[RoadmapPhaseOut]:
    """Regenerates all 5 phases wholesale (replaces any prior roadmap for this business case).

    Duration/budget/resources per phase are the deterministic scaffold from
    app/services/transformation_roadmap.py. Objectives/deliverables/risks/KPIs per phase come
    from one AIRouter.dispatch("analyze_document", ...) call per phase, grounded in this
    business case's real intake + real scored opportunities (see
    app/ai/context.py::build_roadmap_phase_document). Rate limiting is checked once per phase
    (5 checks total for this one generation) since this action genuinely performs 5 real AI
    dispatches — accurately reflecting quota consumption rather than under-counting it.
    """
    case = _get_case_or_404(db, principal, business_case_id)
    opportunities = list_opportunities_for_case(db, principal.organization_id, business_case_id)

    scored_opportunities = []
    for o in opportunities:
        result = compute_opportunity_score(
            business_impact=o.business_impact,
            feasibility=o.feasibility,
            data_readiness=o.data_readiness,
            cost=o.cost,
            time_to_value=o.time_to_value,
            risk=o.risk,
        )
        scored_opportunities.append(
            {
                "name": o.name,
                "overall_score": result.overall_score,
                "business_impact": o.business_impact,
                "feasibility": o.feasibility,
                "data_readiness": o.data_readiness,
                "cost": o.cost,
                "time_to_value": o.time_to_value,
                "risk": o.risk,
            }
        )
    scored_opportunities.sort(key=lambda o: o["overall_score"], reverse=True)

    scaffold = build_phase_scaffold(case.budget, case.timeline)

    delete_roadmap_phases_for_case(db, case.id)

    created_phases: list[RoadmapPhase] = []
    for phase_scaffold in scaffold:
        doc_context = build_roadmap_phase_document(case, scored_opportunities, phase_scaffold.phase)

        ai_router.enforce_rate_limit(scope_key=_scope_key(principal), read_only=principal.read_only)
        response = ai_router.dispatch(
            db,
            organization_id=principal.organization_id,
            endpoint=f"/api/v1/consulting/business-cases/{business_case_id}/roadmap",
            method_name="analyze_document",
            context=doc_context,
        )

        # response.data carries the structured requirements/deliverables/risks/action_items
        # buckets when Demo AI answered (see app/ai/providers/demo.py::analyze_document); a
        # live provider (Gemini/Groq) only guarantees summary/detail free text and leaves
        # `data` empty (see app/ai/providers/gemini.py::_respond) — same limitation the
        # pre-existing document-intelligence feature has (app/api/documents.py). When that
        # happens, fall back to running the identical deterministic extraction ourselves
        # directly against the same real crafted text, so the persisted lists are never empty
        # and always grounded in this business case's real data — never generic filler —
        # while `source` still honestly reflects which provider actually answered.
        local_extraction = extract_structured_document_info(doc_context["text"])
        objectives = response.data.get("requirements") or local_extraction["requirements"]
        deliverables = response.data.get("deliverables") or local_extraction["deliverables"]
        risks = response.data.get("risks") or local_extraction["risks"]
        kpis = response.data.get("action_items") or local_extraction["action_items"]

        phase_row = RoadmapPhase(
            business_case_id=case.id,
            phase=phase_scaffold.phase,
            objectives=objectives,
            deliverables=deliverables,
            kpis=kpis,
            risks=risks,
            duration_weeks=phase_scaffold.duration_weeks,
            resources=phase_scaffold.resources,
            budget=phase_scaffold.budget,
            sequence_order=phase_scaffold.sequence_order,
            source=response.source,
        )
        db.add(phase_row)
        created_phases.append(phase_row)

    db.commit()
    for phase_row in created_phases:
        db.refresh(phase_row)

    return [RoadmapPhaseOut.model_validate(p) for p in created_phases]


@router.get("/business-cases/{business_case_id}/roadmap", response_model=list[RoadmapPhaseOut])
def get_roadmap(
    business_case_id: UUID,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> list[RoadmapPhaseOut]:
    _get_case_or_404(db, principal, business_case_id)
    phases = list_roadmap_phases_for_case(db, principal.organization_id, business_case_id)
    return [RoadmapPhaseOut.model_validate(p) for p in phases]
