"""Builds the structured `context` dicts passed to every AIProvider method.

This is the one place that reads real DB-backed data and reuses the existing deterministic
services (health_score, cost_forecast, resource_state)  -  providers (live or demo) never
query the database themselves, they only ever see the dict this module hands them. That
keeps org-scoping discipline in one place (every query here goes through the same
organization_id-scoped repository functions used elsewhere in the app) and keeps
DemoAIProvider honest: it can only ever describe what's actually in these dicts.
"""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.serializers import derive_risk_severity
from app.models.enums import RiskStatus, TaskStatus
from app.models.organization import Organization
from app.models.project import Project
from app.models.task import Task, TaskDependency
from app.repositories.projects import list_projects
from app.repositories.resources import list_allocations_for_project, list_resources
from app.repositories.risks import list_all_risks_for_org, list_risks_for_project
from app.repositories.tasks import list_all_tasks_for_org, list_tasks_for_project
from app.services.cost_forecast import compute_cost_forecast
from app.services.health_score import compute_health_score
from app.services.resource_state import compute_all_resource_states, count_overloaded_resources_for_project


def _risk_dict(risk, project_name: str | None = None) -> dict:
    score = risk.probability * risk.impact
    out = {
        "title": risk.title,
        "category": risk.category.value,
        "score": score,
        "severity": derive_risk_severity(score).value,
        "status": risk.status.value,
        "owner": risk.owner,
    }
    if project_name is not None:
        out["project_name"] = project_name
    return out


def build_project_context(db: Session, organization_id: UUID, project: Project) -> dict:
    """Everything DemoAIProvider.analyze_project / the live providers' project-health
    prompt need  -  all computed by the same services GET /health and GET /forecast use."""
    tasks = list_tasks_for_project(db, organization_id, project.id)
    risks = list_risks_for_project(db, organization_id, project.id)
    overloaded_count = count_overloaded_resources_for_project(db, organization_id, project.id)
    health = compute_health_score(project, tasks, risks, overloaded_count)
    forecast = compute_cost_forecast(project)

    active_risks = sorted(
        (r for r in risks if r.status in (RiskStatus.OPEN, RiskStatus.MITIGATING)),
        key=lambda r: r.probability * r.impact,
        reverse=True,
    )
    top_risks = [_risk_dict(r) for r in active_risks[:3]]

    blocked_tasks = [
        {"title": t.title, "due_date": t.due_date.isoformat() if t.due_date else None}
        for t in tasks
        if t.status == TaskStatus.BLOCKED
    ]

    resource_states = compute_all_resource_states(db, organization_id)
    allocations = list_allocations_for_project(db, organization_id, project.id)
    resources_by_id = {r.id: r for r in list_resources(db, organization_id)}
    overloaded_resources = []
    seen: set[UUID] = set()
    for allocation in allocations:
        if allocation.resource_id in seen:
            continue
        workload, state = resource_states.get(allocation.resource_id, (0.0, None))
        if state is not None and state.value == "OVERLOADED":
            seen.add(allocation.resource_id)
            resource = resources_by_id.get(allocation.resource_id)
            if resource is not None:
                overloaded_resources.append(
                    {
                        "name": resource.name,
                        "workload": round(workload, 1),
                        "capacity": float(resource.capacity_hours_per_week or 0),
                    }
                )

    done_tasks = sum(1 for t in tasks if t.status == TaskStatus.DONE)

    return {
        "project_id": str(project.id),
        "project_name": project.name,
        "status": project.status.value,
        "priority": project.priority.value,
        "client": project.client,
        "manager_name": project.manager_name,
        "progress": project.progress,
        "budget": float(project.budget or 0),
        "actual_cost": float(project.actual_cost or 0),
        "health_score": health.health_score,
        "risk_level": health.risk_level.value,
        "planned_pct": health.planned_pct,
        "avg_task_completion": health.avg_task_completion,
        "breakdown": health.breakdown,
        "forecast": {
            "forecasted_final_cost": forecast.forecasted_final_cost,
            "variance": forecast.variance,
            "variance_percent": forecast.variance_percent,
            "overrun_probability": forecast.overrun_probability,
            "method": forecast.method,
            "cpi": forecast.cpi,
            "earned_value": forecast.earned_value,
        },
        "top_risks": top_risks,
        "blocked_tasks": blocked_tasks,
        "overloaded_resources": overloaded_resources,
        "total_tasks": len(tasks),
        "done_tasks": done_tasks,
    }


def build_portfolio_context(db: Session, organization_id: UUID) -> dict:
    """Everything DemoAIProvider.generate_report / the live providers' executive-summary
    prompt need  -  built on top of the same aggregation GET /dashboard uses."""
    from app.api.dashboard import build_dashboard  # local import: avoids an api->ai->api cycle at module load

    organization = db.get(Organization, organization_id)
    organization_name = organization.name if organization is not None else "the organization"

    dashboard = build_dashboard(db, organization_id)
    projects = list_projects(db, organization_id)

    lowest = None
    if dashboard.projects:
        lowest_out = min(dashboard.projects, key=lambda p: p.health_score)
        lowest_project = next((p for p in projects if p.id == lowest_out.id), None)
        if lowest_project is not None:
            tasks = list_tasks_for_project(db, organization_id, lowest_project.id)
            risks = list_risks_for_project(db, organization_id, lowest_project.id)
            overloaded_count = count_overloaded_resources_for_project(db, organization_id, lowest_project.id)
            health = compute_health_score(lowest_project, tasks, risks, overloaded_count)
            lowest = {
                "project_id": str(lowest_project.id),
                "name": lowest_project.name,
                "status": lowest_project.status.value,
                "health_score": health.health_score,
                "risk_level": health.risk_level.value,
                "breakdown": health.breakdown,
            }

    all_risks = list_all_risks_for_org(db, organization_id)
    project_names = {p.id: p.name for p in projects}
    active_risks = sorted(
        (r for r in all_risks if r.status in (RiskStatus.OPEN, RiskStatus.MITIGATING)),
        key=lambda r: r.probability * r.impact,
        reverse=True,
    )
    top_portfolio_risks = [_risk_dict(r, project_names.get(r.project_id)) for r in active_risks[:5]]

    return {
        "organization_name": organization_name,
        "total_projects": dashboard.total_projects,
        "active_projects": dashboard.active_projects,
        "at_risk_projects": dashboard.at_risk_projects,
        "completed_projects": dashboard.completed_projects,
        "avg_health_score": dashboard.avg_health_score,
        "budget_utilization_pct": dashboard.budget_utilization_pct,
        "resource_utilization_pct": dashboard.resource_utilization_pct,
        "total_budget": dashboard.total_budget,
        "total_actual_cost": dashboard.total_actual_cost,
        "blocked_tasks": dashboard.blocked_tasks,
        "open_risks": dashboard.open_risks,
        "critical_risks": dashboard.critical_risks,
        "overloaded_resources": dashboard.overloaded_resources,
        "total_resources": dashboard.total_resources,
        "lowest_health_project": lowest,
        "top_portfolio_risks": top_portfolio_risks,
        "projects_by_status": dashboard.projects_by_status,
    }


def _find_blocking_task(db: Session, tasks: list[Task]) -> dict | None:
    """The task other work is waiting on that isn't DONE yet  -  not necessarily itself
    marked BLOCKED (a task with status BLOCKED is the *dependent*; the thing actually
    blocking delivery is whatever unfinished task it depends on)."""
    task_ids = [t.id for t in tasks]
    if not task_ids:
        return None

    tasks_by_id = {t.id: t for t in tasks}
    dep_rows = db.scalars(select(TaskDependency).where(TaskDependency.task_id.in_(task_ids))).all()
    blocks_count: dict[UUID, int] = {}
    for dep in dep_rows:
        blocks_count[dep.depends_on_task_id] = blocks_count.get(dep.depends_on_task_id, 0) + 1

    candidates = [
        (task_id, count)
        for task_id, count in blocks_count.items()
        if task_id in tasks_by_id and tasks_by_id[task_id].status != TaskStatus.DONE
    ]
    if candidates:
        candidates.sort(key=lambda pair: pair[1], reverse=True)
        top_id, count = candidates[0]
        top = tasks_by_id[top_id]
        return {
            "title": top.title,
            "status": top.status.value,
            "due_date": top.due_date.isoformat() if top.due_date else None,
            "blocks_count": count,
        }

    # No task_dependencies edges cover this scope (the seed dataset sets task.status =
    # BLOCKED directly rather than always modeling it via the dependency graph). Fall back
    # to the task's own BLOCKED status as the next-best real signal, rather than reporting
    # "no blocking task" when the data in fact flags one. blocks_count=0 is left honest  - 
    # it means "no dependency-graph data available", not "blocks zero other tasks".
    blocked = [t for t in tasks if t.status == TaskStatus.BLOCKED]
    if not blocked:
        return None
    with_due_date = [t for t in blocked if t.due_date]
    chosen = min(with_due_date, key=lambda t: t.due_date) if with_due_date else blocked[0]
    return {
        "title": chosen.title,
        "status": chosen.status.value,
        "due_date": chosen.due_date.isoformat() if chosen.due_date else None,
        "blocks_count": 0,
    }


def build_assistant_context(
    db: Session, organization_id: UUID, question: str, project: Project | None
) -> dict:
    """context for POST /api/v1/ai/assistant. Scoped to a single project if `project_id`
    was given in the request body, otherwise portfolio-wide."""
    if project is not None:
        scope = "project"
        project_ctx = build_project_context(db, organization_id, project)
        portfolio_ctx = None
        tasks = list_tasks_for_project(db, organization_id, project.id)
    else:
        scope = "portfolio"
        project_ctx = None
        portfolio_ctx = build_portfolio_context(db, organization_id)
        tasks = list_all_tasks_for_org(db, organization_id)

    resource_states = compute_all_resource_states(db, organization_id)
    resources = list_resources(db, organization_id)
    resource_rows = [
        {
            "name": r.name,
            "role": r.role,
            "workload": round(resource_states.get(r.id, (0.0, None))[0], 1),
            "capacity": float(r.capacity_hours_per_week or 0),
            "utilization_state": (
                resource_states.get(r.id, (0.0, None))[1].value
                if resource_states.get(r.id, (0.0, None))[1] is not None
                else "UNKNOWN"
            ),
        }
        for r in resources
    ]

    blocking_task = _find_blocking_task(db, tasks)

    return {
        "question": question,
        "scope": scope,
        "project": project_ctx,
        "portfolio": portfolio_ctx,
        "resources": resource_rows,
        "blocking_task": blocking_task,
    }
