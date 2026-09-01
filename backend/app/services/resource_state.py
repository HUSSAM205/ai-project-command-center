from uuid import UUID

from sqlalchemy.orm import Session

from app.models.enums import UtilizationState
from app.repositories.resources import list_allocations_for_org, list_resources
from app.services.common import compute_resource_workload, compute_utilization_state


def compute_all_resource_states(
    db: Session, organization_id: UUID
) -> dict[UUID, tuple[float, UtilizationState]]:
    """Returns {resource_id: (current_workload_hours_per_week, utilization_state)} for every
    resource in the org, derived from currently-active resource_allocations."""
    resources = list_resources(db, organization_id)
    allocations = list_allocations_for_org(db, organization_id)
    states: dict[UUID, tuple[float, UtilizationState]] = {}
    for resource in resources:
        workload = compute_resource_workload(resource, allocations)
        state = compute_utilization_state(workload, float(resource.capacity_hours_per_week or 0))
        states[resource.id] = (workload, state)
    return states


def count_overloaded_resources_for_project(
    db: Session,
    organization_id: UUID,
    project_id: UUID,
    resource_states: dict[UUID, tuple[float, UtilizationState]] | None = None,
) -> int:
    from app.repositories.resources import list_allocations_for_project

    if resource_states is None:
        resource_states = compute_all_resource_states(db, organization_id)
    allocations = list_allocations_for_project(db, organization_id, project_id)
    overloaded_resource_ids = {
        a.resource_id
        for a in allocations
        if resource_states.get(a.resource_id, (0, None))[1] == UtilizationState.OVERLOADED
    }
    return len(overloaded_resource_ids)
