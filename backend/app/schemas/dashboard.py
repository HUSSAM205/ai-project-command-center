from datetime import date
from typing import Literal

from pydantic import BaseModel

from app.schemas.project import ProjectOut


class UpcomingDeadline(BaseModel):
    id: str
    name: str
    due_date: date
    type: Literal["MILESTONE", "TASK"]


class DashboardOut(BaseModel):
    total_projects: int
    active_projects: int
    at_risk_projects: int
    completed_projects: int

    # Frontend contract field names (docs/PRODUCT_REQUIREMENTS.md only says "portfolio KPIs"
    # without pinning an exact shape — these names/shapes match the already-built frontend
    # in frontend/lib/types.ts::DashboardSummary).
    avg_health_score: float
    budget_utilization_pct: float
    resource_utilization_pct: float
    upcoming_deadlines: list[UpcomingDeadline]
    total_budget: float
    total_actual_cost: float
    risk_counts: dict[str, int]
    projects_by_status: dict[str, int]

    # Additional KPIs beyond the frontend's current contract — harmless extras for callers
    # that want them (e.g. a richer ops view), ignored by clients that don't reference them.
    total_tasks: int
    blocked_tasks: int
    open_risks: int
    critical_risks: int
    overloaded_resources: int
    total_resources: int
    projects: list[ProjectOut]
