from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.ai.context import build_project_context
from app.ai.router import AIRouter as AIOrchestrator
from app.ai.router import get_ai_router
from app.api.serializers import serialize_project
from app.core.database import get_db
from app.core.deps import CurrentPrincipal, get_current_principal, require_write_access
from app.repositories.projects import get_project, list_projects
from app.repositories.risks import list_risks_for_project
from app.repositories.tasks import list_tasks_for_project
from app.models.project import Project
from app.schemas.ai import AIResponse
from app.schemas.project import (
    CostForecastOut,
    HealthScoreOut,
    MonteCarloForecastOut,
    ProjectCreate,
    ProjectOut,
    ProjectUpdate,
)
from app.services.audit import log_audit_event
from app.services.cost_forecast import compute_cost_forecast
from app.services.health_score import compute_health_score
from app.services.monte_carlo import compute_monte_carlo_forecast
from app.services.resource_state import compute_all_resource_states, count_overloaded_resources_for_project

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])


def _get_project_or_404(db: Session, organization_id: UUID, project_id: UUID) -> Project:
    project = get_project(db, organization_id, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project not found")
    return project


@router.get("", response_model=list[ProjectOut])
def list_all_projects(
    principal: CurrentPrincipal = Depends(get_current_principal), db: Session = Depends(get_db)
) -> list[ProjectOut]:
    projects = list_projects(db, principal.organization_id)
    resource_states = compute_all_resource_states(db, principal.organization_id)
    out = []
    for project in projects:
        tasks = list_tasks_for_project(db, principal.organization_id, project.id)
        risks = list_risks_for_project(db, principal.organization_id, project.id)
        overloaded = count_overloaded_resources_for_project(
            db, principal.organization_id, project.id, resource_states
        )
        out.append(serialize_project(project, tasks, risks, overloaded))
    return out


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> ProjectOut:
    project = Project(organization_id=principal.organization_id, **payload.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)
    log_audit_event(
        db,
        organization_id=principal.organization_id,
        actor_user_id=principal.user_id,
        action="project.created",
        entity_type="project",
        entity_id=project.id,
        metadata={"name": project.name, "status": project.status.value},
    )
    return serialize_project(project, [], [], 0)


@router.get("/{project_id}", response_model=ProjectOut)
def get_project_detail(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> ProjectOut:
    project = _get_project_or_404(db, principal.organization_id, project_id)
    tasks = list_tasks_for_project(db, principal.organization_id, project_id)
    risks = list_risks_for_project(db, principal.organization_id, project_id)
    overloaded = count_overloaded_resources_for_project(db, principal.organization_id, project_id)
    return serialize_project(project, tasks, risks, overloaded)


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: UUID,
    payload: ProjectUpdate,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> ProjectOut:
    project = _get_project_or_404(db, principal.organization_id, project_id)
    changed_fields = payload.model_dump(exclude_unset=True)
    for field, value in changed_fields.items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    log_audit_event(
        db,
        organization_id=principal.organization_id,
        actor_user_id=principal.user_id,
        action="project.updated",
        entity_type="project",
        entity_id=project.id,
        metadata={"fields": list(changed_fields.keys())},
    )
    tasks = list_tasks_for_project(db, principal.organization_id, project_id)
    risks = list_risks_for_project(db, principal.organization_id, project_id)
    overloaded = count_overloaded_resources_for_project(db, principal.organization_id, project_id)
    return serialize_project(project, tasks, risks, overloaded)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> None:
    project = _get_project_or_404(db, principal.organization_id, project_id)
    db.delete(project)
    db.commit()


@router.get("/{project_id}/health", response_model=HealthScoreOut)
def get_project_health(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> HealthScoreOut:
    project = _get_project_or_404(db, principal.organization_id, project_id)
    tasks = list_tasks_for_project(db, principal.organization_id, project_id)
    risks = list_risks_for_project(db, principal.organization_id, project_id)
    overloaded = count_overloaded_resources_for_project(db, principal.organization_id, project_id)
    result = compute_health_score(project, tasks, risks, overloaded)
    return HealthScoreOut(
        project_id=project.id,
        health_score=result.health_score,
        risk_level=result.risk_level,
        planned_pct=result.planned_pct,
        avg_task_completion=result.avg_task_completion,
        schedule_penalty=result.breakdown["schedule_penalty"],
        budget_penalty=result.breakdown["budget_penalty"],
        task_penalty=result.breakdown["task_penalty"],
        risk_penalty=result.breakdown["risk_penalty"],
        resource_penalty=result.breakdown["resource_penalty"],
        dependency_penalty=result.breakdown["dependency_penalty"],
        total_penalty=result.breakdown["total_penalty"],
        breakdown=result.breakdown,
    )


@router.get("/{project_id}/forecast", response_model=CostForecastOut)
def get_project_forecast(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> CostForecastOut:
    project = _get_project_or_404(db, principal.organization_id, project_id)
    result = compute_cost_forecast(project)
    return CostForecastOut(
        project_id=project.id,
        budget=project.budget,
        actual_cost=project.actual_cost,
        forecasted_final_cost=result.forecasted_final_cost,
        variance=result.variance,
        variance_percent=result.variance_percent,
        overrun_probability=result.overrun_probability,
        method=result.method,
        cpi=result.cpi,
        earned_value=result.earned_value,
    )


@router.get("/{project_id}/forecast/monte-carlo", response_model=MonteCarloForecastOut)
def get_project_monte_carlo_forecast(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> MonteCarloForecastOut:
    """1,000-run Monte Carlo delivery forecast — P50/P85/P95 completion dates from bootstrap-
    resampling this org's own historical task estimate accuracy. See
    app/services/monte_carlo.py's module docstring for the full method. A plain `def` route (like
    every other CPU-bound endpoint in this file) so FastAPI runs it in its worker threadpool
    rather than on the event loop -- 1,000 runs of simple arithmetic is fast, but this keeps the
    same off-event-loop guarantee the rest of this file already relies on."""
    project = _get_project_or_404(db, principal.organization_id, project_id)
    result = compute_monte_carlo_forecast(db, principal.organization_id, project)
    return MonteCarloForecastOut(
        project_id=project.id,
        p50_date=result.p50_date,
        p85_date=result.p85_date,
        p95_date=result.p95_date,
        remaining_task_count=result.remaining_task_count,
        remaining_hours_estimate=result.remaining_hours_estimate,
        weekly_capacity_hours=result.weekly_capacity_hours,
        historical_sample_size=result.historical_sample_size,
        method=result.method,
        runs=result.runs,
    )


@router.get("/{project_id}/ai-insights", response_model=AIResponse)
def get_project_ai_insights(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
    ai_router: AIOrchestrator = Depends(get_ai_router),
) -> AIResponse:
    """Per-project AI analysis, built from the same health-score/forecast/risk data as
    /health and /forecast. Demo/read-only tokens can call this — it's a read, not a
    mutation — subject to the tighter anonymous AI rate limit."""
    project = _get_project_or_404(db, principal.organization_id, project_id)
    ai_router.enforce_rate_limit(
        scope_key=f"{principal.organization_id}:{principal.session_id or principal.user_id}",
        read_only=principal.read_only,
    )
    context = build_project_context(db, principal.organization_id, project)
    response = ai_router.dispatch(
        db,
        organization_id=principal.organization_id,
        endpoint=f"/api/v1/projects/{project_id}/ai-insights",
        method_name="analyze_project",
        context=context,
    )
    log_audit_event(
        db,
        organization_id=principal.organization_id,
        actor_user_id=principal.user_id,
        action="ai.request",
        entity_type="ai_request",
        entity_id=project.id,
        metadata={"endpoint": f"/api/v1/projects/{project_id}/ai-insights", "provider": response.source},
    )
    return response
