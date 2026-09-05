from datetime import date
from typing import Literal

from pydantic import BaseModel

from app.schemas.project import ProjectOut


class UpcomingDeadline(BaseModel):
    id: str
    name: str
    due_date: date
    type: Literal["MILESTONE", "TASK"]


class PortfolioEVMOut(BaseModel):
    """Portfolio-wide EVM: BAC/PV/EV/AC summed across every project, then CPI/SPI/SV/CV/EAC/VAC
    derived from those sums using the exact same formulas as app/services/evm.py's per-project
    computation -- never a separately-invented portfolio formula. Computed fresh on every read,
    like every other EVM figure in this app; nothing here is a stored historical snapshot, so
    there is no time-series/trend data behind this -- see docs/ENTERPRISE_ARCHITECTURE_SPEC.md."""

    bac: float
    pv: float
    ev: float
    ac: float
    cpi: float | None
    spi: float | None
    sv: float
    cv: float
    eac: float
    vac: float
    critical_exposure: float  # sum of BAC across projects whose current rag_status is CRITICAL
    project_count: int


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
    portfolio_evm: PortfolioEVMOut
