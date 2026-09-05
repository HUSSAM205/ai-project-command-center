from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.enums import UtilizationState
from app.repositories.resources import list_allocations_for_org, list_resources
from app.services.common import compute_resource_workload, compute_utilization_state, is_allocation_active


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


@dataclass
class ResourceAllocationCell:
    project_id: UUID
    project_name: str
    allocation_percent: int
    is_single_point_of_failure: bool


@dataclass
class ResourceMatrixRow:
    resource_id: UUID
    resource_name: str
    role: str | None
    utilization_state: UtilizationState
    workload_hours: float
    capacity_hours: float
    allocations: list[ResourceAllocationCell]


def compute_resource_project_matrix(db: Session, organization_id: UUID) -> list[ResourceMatrixRow]:
    """Cross-project resource x allocation grid, plus single-point-of-failure flagging: an
    allocation is flagged when its resource is the ONLY person currently allocated to that
    project -- i.e. if this person were unavailable tomorrow, that project would have zero
    remaining staff. A real, computable definition from this app's actual allocation data, not an
    invented risk score."""
    resources = list_resources(db, organization_id)
    all_allocations = list_allocations_for_org(db, organization_id)
    states = compute_all_resource_states(db, organization_id)

    today = date.today()
    active_allocations = [a for a in all_allocations if is_allocation_active(a, today)]

    resource_ids_by_project: dict[UUID, set[UUID]] = defaultdict(set)
    for a in active_allocations:
        resource_ids_by_project[a.project_id].add(a.resource_id)

    rows: list[ResourceMatrixRow] = []
    for resource in resources:
        workload, state = states.get(resource.id, (0.0, UtilizationState.UNDERUTILIZED))
        my_allocations = [a for a in active_allocations if a.resource_id == resource.id]
        cells = [
            ResourceAllocationCell(
                project_id=a.project_id,
                project_name=a.project.name if a.project else "Unknown project",
                allocation_percent=a.allocation_percent,
                is_single_point_of_failure=len(resource_ids_by_project.get(a.project_id, set())) <= 1,
            )
            for a in my_allocations
        ]
        rows.append(
            ResourceMatrixRow(
                resource_id=resource.id,
                resource_name=resource.name,
                role=resource.role,
                utilization_state=state,
                workload_hours=round(workload, 1),
                capacity_hours=float(resource.capacity_hours_per_week or 0),
                allocations=cells,
            )
        )
    return rows


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
