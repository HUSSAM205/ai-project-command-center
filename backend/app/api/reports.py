"""One-click report generators (Phase 6). No new tables — every section is composed from
data already computed by existing services/repositories, exactly like GET /dashboard and
GET /analytics. The one AI-generated narrative section per report reuses AIRouter.dispatch
via the same patterns already established by GET /api/v1/ai/executive-brief (portfolio
scope -> `generate_report`) and GET /api/v1/projects/{id}/ai-insights (project scope ->
`analyze_project`); the `risk` report additionally reuses the pre-existing but previously
unused `analyze_risk` provider method, since it is a better fit for risk-specific narrative
than shoehorning risk data into the generic project/portfolio shapes.
"""

from datetime import date, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.ai.context import build_portfolio_context, build_project_context
from app.ai.router import AIRouter as AIOrchestrator
from app.ai.router import get_ai_router
from app.api.serializers import derive_risk_severity
from app.core.database import get_db
from app.core.deps import CurrentPrincipal, get_current_principal
from app.models.enums import MilestoneStatus, TaskStatus
from app.models.organization import Organization
from app.models.project import Project
from app.repositories.ai_requests import list_ai_requests_for_org
from app.repositories.budgets import list_all_transactions_for_org, list_transactions
from app.repositories.milestones import list_all_milestones_for_org, list_milestones_for_project
from app.repositories.projects import get_project
from app.repositories.risks import list_all_risks_for_org, list_risks_for_project
from app.repositories.tasks import list_all_tasks_for_org, list_tasks_for_project
from app.schemas.ai import AIResponse
from app.schemas.report import REPORT_TITLES, ReportOut, ReportSection
from app.services.resource_state import compute_all_resource_states, count_overloaded_resources_for_project

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])

VALID_REPORT_TYPES = set(REPORT_TITLES.keys())


def _money(value: float) -> str:
    return f"${value:,.0f}"


def _scope_key(principal: CurrentPrincipal) -> str:
    return f"{principal.organization_id}:{principal.user_id}"


def _tasks_and_risks(db: Session, org_id: UUID, project: Project | None):
    if project is not None:
        return (
            list_tasks_for_project(db, org_id, project.id),
            list_risks_for_project(db, org_id, project.id),
        )
    return list_all_tasks_for_org(db, org_id), list_all_risks_for_org(db, org_id)


def _dispatch_narrative(db: Session, org_id: UUID, ai_router: AIOrchestrator, endpoint: str, project: Project | None) -> AIResponse:
    """The one AI-generated narrative section every report (except `risk`) has. Project
    scope -> analyze_project (same dispatch as GET /projects/{id}/ai-insights). Portfolio
    scope -> generate_report (same dispatch as GET /ai/executive-brief). No parallel
    narrative-generation path is built here — both calls go through the same AIRouter."""
    if project is not None:
        context = build_project_context(db, org_id, project)
        return ai_router.dispatch(db, organization_id=org_id, endpoint=endpoint, method_name="analyze_project", context=context)
    context = build_portfolio_context(db, org_id)
    return ai_router.dispatch(db, organization_id=org_id, endpoint=endpoint, method_name="generate_report", context=context)


# ---- section builders (pure, given already-fetched data) ----


def _section_executive_summary(ai_response: AIResponse) -> ReportSection:
    return ReportSection(heading="Executive Summary", body=ai_response.summary, data={"confidence": ai_response.confidence})


def _section_recommendations(ai_response: AIResponse, heading: str = "Recommendations") -> ReportSection:
    body = ai_response.detail or ai_response.summary
    return ReportSection(
        heading=heading,
        body=body,
        data={"confidence": ai_response.confidence, "prompt_version": ai_response.prompt_version},
    )


def _section_current_status(project: Project | None, portfolio_ctx: dict | None, project_ctx: dict | None) -> ReportSection:
    if project is not None and project_ctx is not None:
        body = (
            f"{project.name} is {project_ctx['status']} (priority {project_ctx['priority']}), "
            f"{project_ctx['progress']}% complete. Health score {project_ctx['health_score']}/100 "
            f"({project_ctx['risk_level']} risk)."
        )
        data = {
            "status": project_ctx["status"],
            "priority": project_ctx["priority"],
            "progress": project_ctx["progress"],
            "health_score": project_ctx["health_score"],
            "risk_level": project_ctx["risk_level"],
        }
    else:
        ctx = portfolio_ctx or {}
        body = (
            f"{ctx.get('total_projects', 0)} projects in the portfolio: {ctx.get('active_projects', 0)} active, "
            f"{ctx.get('at_risk_projects', 0)} at risk, {ctx.get('completed_projects', 0)} completed. "
            f"Average health score {ctx.get('avg_health_score', 0):.0f}/100."
        )
        data = {
            "total_projects": ctx.get("total_projects"),
            "active_projects": ctx.get("active_projects"),
            "at_risk_projects": ctx.get("at_risk_projects"),
            "completed_projects": ctx.get("completed_projects"),
            "avg_health_score": ctx.get("avg_health_score"),
            "projects_by_status": ctx.get("projects_by_status"),
        }
    return ReportSection(heading="Current Status", body=body, data=data)


def _section_progress(tasks: list, milestones: list) -> ReportSection:
    done = sum(1 for t in tasks if t.status == TaskStatus.DONE)
    total = len(tasks)
    task_pct = round(100 * done / total, 1) if total else 0.0
    m_done = sum(1 for m in milestones if m.status == MilestoneStatus.COMPLETED)
    m_total = len(milestones)
    body = f"{done}/{total} tasks complete ({task_pct}%)." + (
        f" {m_done}/{m_total} milestones complete." if m_total else " No milestones recorded."
    )
    return ReportSection(
        heading="Progress",
        body=body,
        data={"tasks_done": done, "tasks_total": total, "milestones_done": m_done, "milestones_total": m_total},
    )


def _section_budget(project: Project | None, portfolio_ctx: dict | None, project_ctx: dict | None) -> ReportSection:
    if project is not None and project_ctx is not None:
        forecast = project_ctx["forecast"]
        budget = project_ctx["budget"]
        actual = project_ctx["actual_cost"]
        spent_pct = (actual / budget * 100) if budget else 0.0
        body = (
            f"Budget {_money(budget)}, actual spend {_money(actual)} ({spent_pct:.0f}% of budget). "
            f"{forecast['method']}: forecasted final cost {_money(forecast['forecasted_final_cost'])} "
            f"({forecast['variance_percent']:+.1f}% variance, {forecast['overrun_probability']:.0f}% overrun probability)."
        )
        data = {"budget": budget, "actual_cost": actual, "spent_percent": round(spent_pct, 2), "forecast": forecast}
    else:
        ctx = portfolio_ctx or {}
        body = (
            f"Portfolio budget {_money(ctx.get('total_budget', 0))}, actual spend "
            f"{_money(ctx.get('total_actual_cost', 0))} ({ctx.get('budget_utilization_pct', 0):.0f}% utilization)."
        )
        data = {
            "total_budget": ctx.get("total_budget"),
            "total_actual_cost": ctx.get("total_actual_cost"),
            "budget_utilization_pct": ctx.get("budget_utilization_pct"),
        }
    return ReportSection(heading="Budget", body=body, data=data)


def _risk_rows(risks: list) -> list[dict]:
    return [
        {
            "title": r.title,
            "category": r.category.value,
            "score": r.probability * r.impact,
            "severity": derive_risk_severity(r.probability * r.impact).value,
            "status": r.status.value,
            "owner": r.owner,
        }
        for r in sorted(risks, key=lambda r: r.probability * r.impact, reverse=True)
    ]


def _section_risks(risks: list) -> ReportSection:
    rows = _risk_rows(risks)
    active_rows = [r for r in rows if r["status"] in ("OPEN", "MITIGATING")]
    severity_counts = {"LOW": 0, "MEDIUM": 0, "HIGH": 0, "CRITICAL": 0}
    for r in rows:
        severity_counts[r["severity"]] += 1
    top = active_rows[:5]
    if top:
        bits = "; ".join(f"{t['title']} ({t['severity']}, score {t['score']})" for t in top)
        body = f"{len(active_rows)} open/mitigating risk(s). Top: {bits}."
    else:
        body = "No open or mitigating risks."
    return ReportSection(
        heading="Risks",
        body=body,
        data={"severity_counts": severity_counts, "top_risks": top, "open_count": len(active_rows)},
    )


def _section_issues(db: Session, org_id: UUID, project: Project | None, tasks: list) -> ReportSection:
    blocked = [t for t in tasks if t.status == TaskStatus.BLOCKED]
    if project is not None:
        overloaded_count = count_overloaded_resources_for_project(db, org_id, project.id)
        overloaded_note = f"{overloaded_count} resource(s) overloaded on this project."
    else:
        resource_states = compute_all_resource_states(db, org_id)
        overloaded_count = sum(1 for _wl, state in resource_states.values() if state.value == "OVERLOADED")
        overloaded_note = f"{overloaded_count} resource(s) overloaded portfolio-wide."
    body = f"{len(blocked)} blocked task(s). {overloaded_note}"
    return ReportSection(
        heading="Issues",
        body=body,
        data={
            "blocked_tasks": [t.title for t in blocked[:10]],
            "blocked_count": len(blocked),
            "overloaded_resources": overloaded_count,
        },
    )


# ---- per-report-type builders: each returns (sections, the AIResponse used for `source`) ----


def _build_status(db: Session, org_id: UUID, project: Project | None, ai_router: AIOrchestrator):
    tasks, _risks = _tasks_and_risks(db, org_id, project)
    milestones = (
        list_milestones_for_project(db, org_id, project.id) if project is not None else list_all_milestones_for_org(db, org_id)
    )
    portfolio_ctx = None if project is not None else build_portfolio_context(db, org_id)
    project_ctx = build_project_context(db, org_id, project) if project is not None else None

    ai_response = _dispatch_narrative(db, org_id, ai_router, "/api/v1/reports/status", project)

    sections = [
        _section_executive_summary(ai_response),
        _section_current_status(project, portfolio_ctx, project_ctx),
        _section_progress(tasks, milestones),
        _section_issues(db, org_id, project, tasks),
        _section_recommendations(ai_response, heading="Next Steps"),
    ]
    return sections, ai_response


def _build_executive(db: Session, org_id: UUID, project: Project | None, ai_router: AIOrchestrator):
    _tasks, risks = _tasks_and_risks(db, org_id, project)
    portfolio_ctx = None if project is not None else build_portfolio_context(db, org_id)
    project_ctx = build_project_context(db, org_id, project) if project is not None else None

    ai_response = _dispatch_narrative(db, org_id, ai_router, "/api/v1/reports/executive", project)

    sections = [
        _section_executive_summary(ai_response),
        _section_current_status(project, portfolio_ctx, project_ctx),
        _section_budget(project, portfolio_ctx, project_ctx),
        _section_risks(risks),
        _section_recommendations(ai_response),
    ]
    return sections, ai_response


def _build_risk(db: Session, org_id: UUID, project: Project | None, ai_router: AIOrchestrator):
    tasks, risks = _tasks_and_risks(db, org_id, project)
    risk_rows = _risk_rows(risks)

    ai_response = ai_router.dispatch(
        db,
        organization_id=org_id,
        endpoint="/api/v1/reports/risk",
        method_name="analyze_risk",
        context={"risks": risk_rows},
    )

    scope_label = project.name if project is not None else "the portfolio"
    intro = ReportSection(
        heading="Executive Summary",
        body=f"Risk posture for {scope_label}: {ai_response.summary}",
        data={"confidence": ai_response.confidence},
    )
    sections = [
        intro,
        _section_risks(risks),
        _section_issues(db, org_id, project, tasks),
        _section_recommendations(ai_response),
    ]
    return sections, ai_response


def _build_budget(db: Session, org_id: UUID, project: Project | None, ai_router: AIOrchestrator):
    portfolio_ctx = None if project is not None else build_portfolio_context(db, org_id)
    project_ctx = build_project_context(db, org_id, project) if project is not None else None
    transactions = (
        list_transactions(db, org_id, project.id) if project is not None else list_all_transactions_for_org(db, org_id)
    )

    ai_response = _dispatch_narrative(db, org_id, ai_router, "/api/v1/reports/budget", project)

    recent = sorted(transactions, key=lambda t: t.date or date.min, reverse=True)[:10]
    tx_rows = [
        {
            "description": t.description,
            "amount": float(t.amount or 0),
            "category": t.category,
            "date": t.date.isoformat() if t.date else None,
        }
        for t in recent
    ]
    tx_body = f"{len(transactions)} recorded transaction(s)."
    if tx_rows:
        tx_body += f" Most recent: {tx_rows[0]['description'] or 'transaction'} ({_money(tx_rows[0]['amount'])})."
    transactions_section = ReportSection(
        heading="Recent Transactions",
        body=tx_body,
        data={"recent_transactions": tx_rows, "transaction_count": len(transactions)},
    )

    sections = [
        _section_executive_summary(ai_response),
        _section_budget(project, portfolio_ctx, project_ctx),
        transactions_section,
        _section_recommendations(ai_response),
    ]
    return sections, ai_response


def _build_ai_transformation(db: Session, org_id: UUID, project: Project | None, ai_router: AIOrchestrator):
    # ai_requests has no project_id column (org-wide only, see app/models/ai_request.py) —
    # this report type is always portfolio-scoped; a project_id filter has no effect here.
    requests = list_ai_requests_for_org(db, org_id)
    total = len(requests)
    by_provider: dict[str, int] = {}
    success_count = 0
    total_latency = 0
    for r in requests:
        by_provider[r.provider_used] = by_provider.get(r.provider_used, 0) + 1
        if r.success:
            success_count += 1
        total_latency += r.latency_ms
    success_rate = round(100 * success_count / total, 1) if total else 0.0
    avg_latency = round(total_latency / total, 0) if total else 0.0
    live_calls = sum(v for k, v in by_provider.items() if k in ("gemini", "groq"))

    portfolio_ctx = build_portfolio_context(db, org_id)
    ai_response = ai_router.dispatch(
        db,
        organization_id=org_id,
        endpoint="/api/v1/reports/ai_transformation",
        method_name="generate_report",
        context=portfolio_ctx,
    )

    adoption_body = (
        f"{total} AI request(s) logged. {by_provider.get('demo_ai', 0)} served by Demo AI, "
        f"{live_calls} by a live provider (Gemini/Groq), {by_provider.get('cache', 0)} from cache. "
        f"{success_rate}% success rate, {avg_latency:.0f}ms average latency."
    )
    if live_calls == 0:
        adoption_body += " No live provider keys are currently configured, so all AI features run in Demo AI mode."

    sections = [
        _section_executive_summary(ai_response),
        ReportSection(
            heading="AI Adoption",
            body=adoption_body,
            data={
                "total_requests": total,
                "by_provider": by_provider,
                "success_rate_pct": success_rate,
                "avg_latency_ms": avg_latency,
            },
        ),
        _section_recommendations(ai_response),
    ]
    return sections, ai_response


def _build_weekly(db: Session, org_id: UUID, project: Project | None, ai_router: AIOrchestrator):
    tasks, _risks = _tasks_and_risks(db, org_id, project)
    transactions = (
        list_transactions(db, org_id, project.id) if project is not None else list_all_transactions_for_org(db, org_id)
    )

    since = date.today() - timedelta(days=7)
    recent_activity = [t for t in tasks if t.updated_at and t.updated_at.date() >= since]
    recent_done = [t for t in recent_activity if t.status == TaskStatus.DONE]
    recent_tx = [t for t in transactions if t.date and t.date >= since]
    recent_spend = sum(float(t.amount or 0) for t in recent_tx)

    ai_response = _dispatch_narrative(db, org_id, ai_router, "/api/v1/reports/weekly", project)

    progress_body = (
        f"{len(recent_activity)} task(s) updated in the last 7 days, {len(recent_done)} marked done. "
        "(Based on each task's last-updated timestamp — there is no separate activity log.)"
    )
    budget_body = f"{len(recent_tx)} transaction(s) recorded in the last 7 days, totaling {_money(recent_spend)}."

    sections = [
        _section_executive_summary(ai_response),
        ReportSection(
            heading="Progress This Week",
            body=progress_body,
            data={"tasks_updated": len(recent_activity), "tasks_completed": len(recent_done)},
        ),
        ReportSection(
            heading="Budget This Week",
            body=budget_body,
            data={"transaction_count": len(recent_tx), "spend": round(recent_spend, 2)},
        ),
        _section_issues(db, org_id, project, tasks),
        _section_recommendations(ai_response, heading="Next Steps"),
    ]
    return sections, ai_response


_BUILDERS = {
    "status": _build_status,
    "executive": _build_executive,
    "risk": _build_risk,
    "budget": _build_budget,
    "ai_transformation": _build_ai_transformation,
    "weekly": _build_weekly,
}


@router.get("/{report_type}", response_model=ReportOut)
def get_report(
    report_type: str,
    project_id: UUID | None = Query(default=None),
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    ai_router: AIOrchestrator = Depends(get_ai_router),
) -> ReportOut:
    """One-click report generator. Demo/read-only tokens can call this — it's a read, not a
    mutation — subject to the tighter anonymous AI rate limit, same as the other AI-touching
    read endpoints (/ai/executive-brief, /projects/{id}/ai-insights)."""
    if report_type not in VALID_REPORT_TYPES:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"unknown report type '{report_type}'")

    organization = db.get(Organization, principal.organization_id)
    organization_name = organization.name if organization is not None else "the organization"

    project: Project | None = None
    if project_id is not None:
        project = get_project(db, principal.organization_id, project_id)
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project not found")

    ai_router.enforce_rate_limit(scope_key=_scope_key(principal), read_only=principal.read_only)

    sections, ai_response = _BUILDERS[report_type](db, principal.organization_id, project, ai_router)

    return ReportOut(
        report_type=report_type,  # type: ignore[arg-type]
        title=REPORT_TITLES[report_type],
        generated_at=datetime.utcnow(),
        organization_name=organization_name,
        project_id=project.id if project is not None else None,
        project_name=project.name if project is not None else None,
        source=ai_response.source,
        sections=sections,
    )
