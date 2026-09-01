from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.ai.router import AIRouter as AIOrchestrator
from app.ai.router import get_ai_router
from app.core.database import get_db
from app.core.deps import CurrentPrincipal, require_permission
from app.repositories.admin import (
    aggregate_ai_usage,
    count_org_projects,
    count_org_users,
    get_organization,
    list_org_users,
)
from app.repositories.audit import list_audit_logs
from app.repositories.feedback import list_feedback
from app.schemas.admin import (
    AdminOrganizationOut,
    AdminUserOut,
    AIProviderStatusOut,
    AIUsageOut,
    AuditLogOut,
    AuditLogPage,
    FeedbackOut,
    FeedbackPage,
)
from app.services.audit import log_audit_event

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

# A single shared dependency instance so FastAPI's per-request dependency cache treats every
# reference to it below as "the same dependency", not one DB lookup per route parameter.
require_admin = require_permission("admin.access")


@router.get("/users", response_model=list[AdminUserOut])
def list_users(
    principal: CurrentPrincipal = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[AdminUserOut]:
    """Org-scoped user list — never cross-tenant, even for an admin (see docs/ARCHITECTURE.md's
    multi-tenancy rule)."""
    users = list_org_users(db, principal.organization_id)
    log_audit_event(
        db,
        organization_id=principal.organization_id,
        actor_user_id=principal.user_id,
        action="admin.users_viewed",
        entity_type="admin",
        metadata={"count": len(users)},
    )
    return [AdminUserOut.model_validate(u) for u in users]


@router.get("/organizations", response_model=AdminOrganizationOut)
def get_own_organization(
    principal: CurrentPrincipal = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AdminOrganizationOut:
    """Single-org-per-token by design: this is "your own org's details", never a cross-tenant
    list — an ADMIN role is still scoped to its own organization_id, same as every other
    endpoint in this app."""
    org = get_organization(db, principal.organization_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="organization not found")
    return AdminOrganizationOut(
        id=org.id,
        name=org.name,
        slug=org.slug,
        is_demo=org.is_demo,
        created_at=org.created_at,
        user_count=count_org_users(db, principal.organization_id),
        project_count=count_org_projects(db, principal.organization_id),
    )


@router.get("/ai-providers", response_model=list[AIProviderStatusOut])
def get_ai_provider_status(
    principal: CurrentPrincipal = Depends(require_admin),
    ai_router: AIOrchestrator = Depends(get_ai_router),
) -> list[AIProviderStatusOut]:
    """Live circuit-breaker/availability snapshot straight from the running AIRouter singleton
    (app/ai/router.py) — not a separate/duplicated tracking mechanism."""
    return [AIProviderStatusOut(**s) for s in ai_router.provider_status()]


@router.get("/ai-usage", response_model=AIUsageOut)
def get_ai_usage(
    hours: int = Query(default=24, ge=1, le=24 * 30),
    principal: CurrentPrincipal = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AIUsageOut:
    """Aggregated from the existing `ai_requests` table (populated by every AIRouter.dispatch()
    call) — see app/repositories/admin.py::aggregate_ai_usage. Not a new source of truth."""
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    result = aggregate_ai_usage(db, principal.organization_id, since)
    return AIUsageOut(window_hours=hours, since=since, **result)


@router.get("/audit-logs", response_model=AuditLogPage)
def get_audit_logs(
    action: str | None = None,
    entity_type: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    principal: CurrentPrincipal = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AuditLogPage:
    rows, total = list_audit_logs(
        db, principal.organization_id, action=action, entity_type=entity_type, page=page, page_size=page_size
    )
    return AuditLogPage(
        items=[AuditLogOut.model_validate(r) for r in rows], total=total, page=page, page_size=page_size
    )


@router.get("/feedback", response_model=FeedbackPage)
def get_feedback(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    principal: CurrentPrincipal = Depends(require_admin),
    db: Session = Depends(get_db),
) -> FeedbackPage:
    rows, total = list_feedback(db, principal.organization_id, page=page, page_size=page_size)
    return FeedbackPage(items=[FeedbackOut.model_validate(r) for r in rows], total=total, page=page, page_size=page_size)
