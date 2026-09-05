import asyncio
import json
from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.serializers import serialize_project
from app.core.database import SessionLocal, get_db
from app.core.deps import CurrentPrincipal, get_current_principal, get_stream_principal
from app.models.enums import MilestoneStatus, ProjectStatus, RiskStatus, TaskStatus, UtilizationState
from app.repositories.milestones import list_all_milestones_for_org
from app.repositories.projects import list_projects
from app.repositories.resources import list_resources
from app.repositories.risks import list_all_risks_for_org
from app.repositories.tasks import list_all_tasks_for_org
from app.models.enums import RagStatus
from app.schemas.dashboard import DashboardOut, PortfolioEVMOut, UpcomingDeadline
from app.services.evm import compute_evm
from app.services.resource_state import compute_all_resource_states, count_overloaded_resources_for_project

router = APIRouter(prefix="/api/v1", tags=["dashboard"])

# How often the SSE stream recomputes the dashboard summary from Postgres and (if changed)
# pushes a new event, and how often it sends a keepalive comment while unchanged.
STREAM_INTERVAL_SECONDS = 4


def build_dashboard(db: Session, organization_id: UUID) -> DashboardOut:
    """Recomputes the full dashboard summary from Postgres.

    Single source of truth for GET /dashboard and GET /dashboard/stream — the stream endpoint
    reuses this directly rather than duplicating the aggregation logic, so both always return
    identical shapes computed the same way.
    """
    projects = list_projects(db, organization_id)
    all_tasks = list_all_tasks_for_org(db, organization_id)
    all_risks = list_all_risks_for_org(db, organization_id)
    all_milestones = list_all_milestones_for_org(db, organization_id)
    resource_states = compute_all_resource_states(db, organization_id)

    tasks_by_project: dict = {}
    for t in all_tasks:
        tasks_by_project.setdefault(t.project_id, []).append(t)
    risks_by_project: dict = {}
    for r in all_risks:
        risks_by_project.setdefault(r.project_id, []).append(r)

    project_outs = []
    health_scores = []
    for project in projects:
        tasks = tasks_by_project.get(project.id, [])
        risks = risks_by_project.get(project.id, [])
        overloaded = count_overloaded_resources_for_project(
            db, organization_id, project.id, resource_states
        )
        out = serialize_project(project, tasks, risks, overloaded)
        project_outs.append(out)
        health_scores.append(out.health_score)

    # Portfolio-wide EVM: BAC/PV/EV/AC/EAC summed across every project (each via the exact same
    # compute_evm() every per-project /evm call uses), then CPI/SPI/SV/CV/VAC derived from those
    # sums -- never a separately-invented portfolio formula. `out.rag_status` (just computed
    # above, same loop order as `projects`) drives critical_exposure with zero extra queries.
    portfolio_bac = portfolio_pv = portfolio_ev = portfolio_ac = portfolio_eac = 0.0
    critical_exposure = 0.0
    for project, out in zip(projects, project_outs):
        evm_result = compute_evm(project, today=date.today())
        portfolio_bac += evm_result.bac
        portfolio_pv += evm_result.pv
        portfolio_ev += evm_result.ev
        portfolio_ac += evm_result.ac
        portfolio_eac += evm_result.eac
        if out.rag_status == RagStatus.CRITICAL:
            critical_exposure += evm_result.bac
    portfolio_cpi = portfolio_ev / portfolio_ac if portfolio_ac > 0 else None
    portfolio_spi = portfolio_ev / portfolio_pv if portfolio_pv > 0 else None
    portfolio_evm = PortfolioEVMOut(
        bac=round(portfolio_bac, 2),
        pv=round(portfolio_pv, 2),
        ev=round(portfolio_ev, 2),
        ac=round(portfolio_ac, 2),
        cpi=round(portfolio_cpi, 4) if portfolio_cpi is not None else None,
        spi=round(portfolio_spi, 4) if portfolio_spi is not None else None,
        sv=round(portfolio_ev - portfolio_pv, 2),
        cv=round(portfolio_ev - portfolio_ac, 2),
        eac=round(portfolio_eac, 2),
        vac=round(portfolio_bac - portfolio_eac, 2),
        critical_exposure=round(critical_exposure, 2),
        project_count=len(projects),
    )

    total_projects = len(projects)
    active_projects = sum(1 for p in projects if p.status == ProjectStatus.ACTIVE)
    at_risk_projects = sum(1 for p in projects if p.status == ProjectStatus.AT_RISK)
    completed_projects = sum(1 for p in projects if p.status == ProjectStatus.COMPLETED)
    total_budget = float(sum(float(p.budget or 0) for p in projects))
    total_actual_cost = float(sum(float(p.actual_cost or 0) for p in projects))
    avg_health_score = round(sum(health_scores) / len(health_scores), 2) if health_scores else 0.0
    budget_utilization_pct = round(total_actual_cost / total_budget * 100, 2) if total_budget > 0 else 0.0

    org_resources = list_resources(db, organization_id)
    total_workload = sum(wl for wl, _state in resource_states.values())
    total_capacity = sum(float(r.capacity_hours_per_week or 0) for r in org_resources)
    resource_utilization_pct = (
        round(total_workload / total_capacity * 100, 2) if total_capacity > 0 else 0.0
    )

    blocked_tasks = sum(1 for t in all_tasks if t.status == TaskStatus.BLOCKED)
    open_risks = sum(1 for r in all_risks if r.status in (RiskStatus.OPEN, RiskStatus.MITIGATING))
    critical_risks = sum(1 for r in all_risks if (r.probability * r.impact) >= 17)
    overloaded_resources = sum(
        1 for _wl, state in resource_states.values() if state == UtilizationState.OVERLOADED
    )

    def risk_severity_bucket(score: int) -> str:
        if score <= 4:
            return "LOW"
        if score <= 9:
            return "MEDIUM"
        if score <= 16:
            return "HIGH"
        return "CRITICAL"

    risk_counts = {"LOW": 0, "MEDIUM": 0, "HIGH": 0, "CRITICAL": 0}
    for r in all_risks:
        risk_counts[risk_severity_bucket(r.probability * r.impact)] += 1

    projects_by_status = {status.value: 0 for status in ProjectStatus}
    for p in projects:
        projects_by_status[p.status.value] += 1

    today = date.today()
    deadlines: list[UpcomingDeadline] = []
    for m in all_milestones:
        if m.due_date and m.due_date >= today and m.status in (MilestoneStatus.PENDING, MilestoneStatus.AT_RISK):
            deadlines.append(UpcomingDeadline(id=str(m.id), name=m.name, due_date=m.due_date, type="MILESTONE"))
    for t in all_tasks:
        if t.due_date and t.due_date >= today and t.status != TaskStatus.DONE:
            deadlines.append(UpcomingDeadline(id=str(t.id), name=t.title, due_date=t.due_date, type="TASK"))
    deadlines.sort(key=lambda d: d.due_date)

    return DashboardOut(
        total_projects=total_projects,
        active_projects=active_projects,
        at_risk_projects=at_risk_projects,
        completed_projects=completed_projects,
        avg_health_score=avg_health_score,
        budget_utilization_pct=budget_utilization_pct,
        resource_utilization_pct=resource_utilization_pct,
        upcoming_deadlines=deadlines[:10],
        total_budget=total_budget,
        total_actual_cost=total_actual_cost,
        risk_counts=risk_counts,
        projects_by_status=projects_by_status,
        total_tasks=len(all_tasks),
        blocked_tasks=blocked_tasks,
        open_risks=open_risks,
        critical_risks=critical_risks,
        overloaded_resources=overloaded_resources,
        total_resources=len(resource_states),
        projects=project_outs,
        portfolio_evm=portfolio_evm,
    )


@router.get("/dashboard", response_model=DashboardOut)
def get_dashboard(
    principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)
) -> DashboardOut:
    return build_dashboard(db, principal.organization_id)


@router.get("/dashboard/stream")
async def stream_dashboard(
    request: Request, principal: CurrentPrincipal = Depends(get_stream_principal)
) -> StreamingResponse:
    """Server-Sent Events stream of the dashboard summary.

    Real-time, not simulated: every tick recomputes the exact same aggregation as
    GET /dashboard directly from Postgres via `build_dashboard` (no duplicated logic) and
    only emits a `data:` event when the resulting payload actually changed since the last
    tick (diff-before-send). Phase 1 has no background job that mutates data on its own, so
    in practice this emits once immediately on connect and then stays quiet — that is the
    correct, honest behavior; this endpoint never injects synthetic jitter/noise to fake
    motion.

    Ticks are also the keepalive mechanism: on ticks where nothing changed, an SSE comment
    (`: keep-alive`) is sent instead of a data event, at the same ~STREAM_INTERVAL_SECONDS
    cadence, so proxies/browsers never see a long silent gap. The connection is checked for
    client disconnect on every tick and closes cleanly when the client goes away.

    Uses its own short-lived DB session per tick (`SessionLocal()`, opened and closed within
    each iteration) rather than the shared request-scoped `get_db` dependency, since this
    connection is expected to stay open far longer than a normal request/response cycle and
    a single long-held session would sit idle-in-transaction between ticks.
    """
    organization_id = principal.organization_id

    async def event_stream():
        last_payload: str | None = None
        while True:
            if await request.is_disconnected():
                break

            db = SessionLocal()
            try:
                dashboard = build_dashboard(db, organization_id)
            finally:
                db.close()

            payload = json.dumps(dashboard.model_dump(mode="json"), sort_keys=True, default=str)
            if payload != last_payload:
                last_payload = payload
                yield f"data: {payload}\n\n"
            else:
                yield ": keep-alive\n\n"

            await asyncio.sleep(STREAM_INTERVAL_SECONDS)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            # Same intent as the keep-alive comments: prevent intermediaries (dev proxies,
            # nginx, etc.) from buffering the stream or timing it out.
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
