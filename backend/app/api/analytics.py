from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dashboard import build_dashboard
from app.core.database import get_db
from app.core.deps import CurrentPrincipal, get_current_principal
from app.models.organization import Organization
from app.repositories.budgets import list_all_transactions_for_org
from app.repositories.risks import list_all_risks_for_org
from app.repositories.tasks import list_all_tasks_for_org
from app.schemas.analytics import AnalyticsOut
from app.services.analytics import build_budget_burn_trend, build_risk_snapshot, build_task_completion_trend

router = APIRouter(prefix="/api/v1", tags=["analytics"])


@router.get("/analytics", response_model=AnalyticsOut)
def get_analytics(
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> AnalyticsOut:
    """Org-scoped portfolio analytics. No new tables — every series is computed on-demand
    from existing rows, reusing build_dashboard (same aggregation GET /dashboard uses) for
    the portfolio totals and the org-scoped *_for_org repositories for the raw rows the
    trends are derived from."""
    organization = db.get(Organization, principal.organization_id)
    organization_name = organization.name if organization is not None else "the organization"

    dashboard = build_dashboard(db, principal.organization_id)
    transactions = list_all_transactions_for_org(db, principal.organization_id)
    tasks = list_all_tasks_for_org(db, principal.organization_id)
    risks = list_all_risks_for_org(db, principal.organization_id)

    return AnalyticsOut(
        generated_at=datetime.utcnow(),
        organization_name=organization_name,
        total_projects=dashboard.total_projects,
        total_budget=dashboard.total_budget,
        total_actual_cost=dashboard.total_actual_cost,
        budget_burn_trend=build_budget_burn_trend(transactions),
        task_completion_trend=build_task_completion_trend(tasks),
        risk_snapshot=build_risk_snapshot(risks),
    )
