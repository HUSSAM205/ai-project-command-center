from datetime import date, datetime

from pydantic import BaseModel


class BudgetBurnPoint(BaseModel):
    """One point on the portfolio-wide cumulative spend curve, derived from the real
    `date` on each budget_transactions row (never fabricated/interpolated)."""

    date: date
    period_spend: float
    cumulative_spend: float


class TaskCompletionPoint(BaseModel):
    """One monthly bucket on the task-completion trend, derived from tasks.due_date /
    tasks.status. `tasks_due_cumulative` / `tasks_completed_cumulative` are cumulative as
    of the end of this bucket, so the series is monotonically non-decreasing."""

    period: str  # "YYYY-MM"
    period_end: date
    tasks_due_cumulative: int
    tasks_completed_cumulative: int
    completion_rate_pct: float


class RiskSnapshot(BaseModel):
    """A point-in-time view of the risk register, NOT a historical trend — there is no
    risk-history table to derive severity-over-time from (see Phase 6 task notes). Named
    `risk_snapshot` rather than `risk_trend` so the frontend/API consumer never mistakes
    this for time-series data."""

    as_of: date
    severity_counts: dict[str, int]
    status_counts: dict[str, int]
    open_count: int
    closed_count: int
    note: str


class AnalyticsOut(BaseModel):
    generated_at: datetime
    organization_name: str
    total_projects: int
    total_budget: float
    total_actual_cost: float
    budget_burn_trend: list[BudgetBurnPoint]
    task_completion_trend: list[TaskCompletionPoint]
    risk_snapshot: RiskSnapshot
