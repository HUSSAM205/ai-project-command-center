from app.models.consulting import AIOpportunity
from app.models.enums import RiskSeverity, UtilizationState
from app.models.pmo import RaciEntry
from app.models.project import Project
from app.models.resource import Resource
from app.models.risk import Risk
from app.schemas.consulting import AIOpportunityOut
from app.schemas.pmo import RaciEntryOut
from app.schemas.project import ProjectOut
from app.schemas.resource import ResourceOut
from app.schemas.risk import RiskOut
from app.services.health_score import compute_health_score
from app.services.opportunity_scoring import compute_opportunity_score


def derive_risk_severity(score: int) -> RiskSeverity:
    if score <= 4:
        return RiskSeverity.LOW
    if score <= 9:
        return RiskSeverity.MEDIUM
    if score <= 16:
        return RiskSeverity.HIGH
    return RiskSeverity.CRITICAL


def serialize_risk(risk: Risk) -> RiskOut:
    score = risk.probability * risk.impact
    return RiskOut(
        id=risk.id,
        project_id=risk.project_id,
        title=risk.title,
        description=risk.description,
        category=risk.category,
        probability=risk.probability,
        impact=risk.impact,
        score=score,
        severity=derive_risk_severity(score),
        owner=risk.owner,
        mitigation=risk.mitigation,
        status=risk.status,
    )


def serialize_resource(
    resource: Resource, workload: float, state: UtilizationState
) -> ResourceOut:
    return ResourceOut(
        id=resource.id,
        organization_id=resource.organization_id,
        name=resource.name,
        role=resource.role,
        department=resource.department,
        skills=resource.skills,
        hourly_cost=resource.hourly_cost,
        capacity_hours_per_week=resource.capacity_hours_per_week,
        current_workload_hours_per_week=round(workload, 2),
        utilization_state=state,
    )


def serialize_opportunity(opportunity: AIOpportunity) -> AIOpportunityOut:
    result = compute_opportunity_score(
        business_impact=opportunity.business_impact,
        feasibility=opportunity.feasibility,
        data_readiness=opportunity.data_readiness,
        cost=opportunity.cost,
        time_to_value=opportunity.time_to_value,
        risk=opportunity.risk,
    )
    return AIOpportunityOut(
        id=opportunity.id,
        business_case_id=opportunity.business_case_id,
        name=opportunity.name,
        description=opportunity.description,
        business_impact=opportunity.business_impact,
        feasibility=opportunity.feasibility,
        data_readiness=opportunity.data_readiness,
        cost=opportunity.cost,
        time_to_value=opportunity.time_to_value,
        risk=opportunity.risk,
        overall_score=result.overall_score,
        score_breakdown=result.score_breakdown,
        created_at=opportunity.created_at,
    )


def serialize_raci(entry: RaciEntry) -> RaciEntryOut:
    """Resource names are denormalized onto the response for a display-ready table (the
    RACI matrix UI shouldn't have to join against /resources itself) — same "resolve the
    display name server-side" approach as Task.assignee_name / Project.manager_name."""
    return RaciEntryOut(
        id=entry.id,
        project_id=entry.project_id,
        task_or_deliverable=entry.task_or_deliverable,
        responsible_id=entry.responsible_id,
        responsible_name=entry.responsible.name if entry.responsible else None,
        accountable_id=entry.accountable_id,
        accountable_name=entry.accountable.name if entry.accountable else None,
        consulted_id=entry.consulted_id,
        consulted_name=entry.consulted.name if entry.consulted else None,
        informed_id=entry.informed_id,
        informed_name=entry.informed.name if entry.informed else None,
        notes=entry.notes,
    )


def serialize_project(project: Project, tasks, risks, overloaded_count: int) -> ProjectOut:
    result = compute_health_score(project, tasks, risks, overloaded_count)
    return ProjectOut(
        id=project.id,
        organization_id=project.organization_id,
        name=project.name,
        description=project.description,
        client=project.client,
        manager_id=project.manager_id,
        manager_name=project.manager_name,
        status=project.status,
        priority=project.priority,
        start_date=project.start_date,
        end_date=project.end_date,
        budget=project.budget,
        actual_cost=project.actual_cost,
        progress=project.progress,
        health_score=result.health_score,
        risk_level=result.risk_level,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )
