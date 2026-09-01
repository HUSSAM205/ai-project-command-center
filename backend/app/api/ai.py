from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.ai.context import build_assistant_context, build_portfolio_context
from app.ai.router import AIRouter, get_ai_router
from app.core.database import get_db
from app.core.deps import CurrentPrincipal, get_current_principal
from app.repositories.projects import get_project
from app.schemas.ai import AIResponse, AssistantRequest
from app.services.audit import log_audit_event

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


def _scope_key(principal: CurrentPrincipal) -> str:
    return f"{principal.organization_id}:{principal.user_id}"


@router.get("/executive-brief", response_model=AIResponse)
def get_executive_brief(
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    ai_router: AIRouter = Depends(get_ai_router),
) -> AIResponse:
    """Org-scoped portfolio-wide brief. Demo/read-only tokens can call this (it's a read,
    not a mutation) — subject to the tighter anonymous rate limit."""
    ai_router.enforce_rate_limit(scope_key=_scope_key(principal), read_only=principal.read_only)
    context = build_portfolio_context(db, principal.organization_id)
    response = ai_router.dispatch(
        db,
        organization_id=principal.organization_id,
        endpoint="/api/v1/ai/executive-brief",
        method_name="generate_report",
        context=context,
    )
    log_audit_event(
        db,
        organization_id=principal.organization_id,
        actor_user_id=principal.user_id,
        action="ai.request",
        entity_type="ai_request",
        metadata={"endpoint": "/api/v1/ai/executive-brief", "provider": response.source},
    )
    return response


@router.post("/assistant", response_model=AIResponse)
def ask_assistant(
    payload: AssistantRequest,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    ai_router: AIRouter = Depends(get_ai_router),
) -> AIResponse:
    """Natural-language Q&A over the org's real data. Demo/read-only tokens can call this —
    it's a read/analysis action, not a data mutation, so it is not gated behind
    require_write_access."""
    ai_router.enforce_rate_limit(scope_key=_scope_key(principal), read_only=principal.read_only)

    project = None
    if payload.project_id is not None:
        project = get_project(db, principal.organization_id, payload.project_id)
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project not found")

    context = build_assistant_context(db, principal.organization_id, payload.question, project)
    response = ai_router.dispatch(
        db,
        organization_id=principal.organization_id,
        endpoint="/api/v1/ai/assistant",
        method_name="answer_project_question",
        context=context,
    )
    log_audit_event(
        db,
        organization_id=principal.organization_id,
        actor_user_id=principal.user_id,
        action="ai.request",
        entity_type="ai_request",
        entity_id=project.id if project else None,
        metadata={"endpoint": "/api/v1/ai/assistant", "provider": response.source},
    )
    return response
