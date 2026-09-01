from datetime import date

from app.models.resource import Resource, ResourceAllocation
from app.models.enums import UtilizationState


def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def is_allocation_active(allocation: ResourceAllocation, today: date | None = None) -> bool:
    today = today or date.today()
    if allocation.start_date and allocation.start_date > today:
        return False
    if allocation.end_date and allocation.end_date < today:
        return False
    return True


def compute_resource_workload(
    resource: Resource, allocations: list[ResourceAllocation], today: date | None = None
) -> float:
    """current_workload_hours_per_week = sum of (allocation_percent/100 * capacity_hours_per_week)
    across this resource's currently-active allocations."""
    today = today or date.today()
    capacity = float(resource.capacity_hours_per_week or 0)
    active = [a for a in allocations if a.resource_id == resource.id and is_allocation_active(a, today)]
    return sum((float(a.allocation_percent) / 100.0) * capacity for a in active)


def compute_utilization_state(workload: float, capacity: float) -> UtilizationState:
    if capacity <= 0:
        return UtilizationState.OVERLOADED if workload > 0 else UtilizationState.UNDERUTILIZED
    ratio = workload / capacity
    if ratio < 0.6:
        return UtilizationState.UNDERUTILIZED
    if ratio <= 1.0:
        return UtilizationState.OPTIMAL
    return UtilizationState.OVERLOADED
