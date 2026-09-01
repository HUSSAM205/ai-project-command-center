"""Deterministic portfolio analytics trends. No randomness, no AI calls, no new tables —
every series here is derived on-demand from existing rows (tasks, budget_transactions,
risks), same spirit as app/services/health_score.py and app/services/cost_forecast.py.
"""

from datetime import date, timedelta

from app.api.serializers import derive_risk_severity
from app.models.budget import BudgetTransaction
from app.models.enums import TaskStatus
from app.models.risk import Risk
from app.models.task import Task
from app.schemas.analytics import BudgetBurnPoint, RiskSnapshot, TaskCompletionPoint


def build_budget_burn_trend(transactions: list[BudgetTransaction]) -> list[BudgetBurnPoint]:
    """Cumulative spend over time, portfolio-wide, bucketed by the transaction's own
    recorded `date`. Transactions without a date are excluded (nothing to plot honestly)."""
    by_date: dict[date, float] = {}
    for t in transactions:
        if t.date is None:
            continue
        by_date[t.date] = by_date.get(t.date, 0.0) + float(t.amount or 0)

    points: list[BudgetBurnPoint] = []
    cumulative = 0.0
    for d in sorted(by_date):
        period_spend = by_date[d]
        cumulative += period_spend
        points.append(
            BudgetBurnPoint(date=d, period_spend=round(period_spend, 2), cumulative_spend=round(cumulative, 2))
        )
    return points


def _month_start(d: date) -> date:
    return d.replace(day=1)


def _next_month(d: date) -> date:
    return date(d.year + 1, 1, 1) if d.month == 12 else date(d.year, d.month + 1, 1)


def build_task_completion_trend(tasks: list[Task]) -> list[TaskCompletionPoint]:
    """Cumulative tasks completed by due-date bucket (monthly), from tasks.due_date/status.
    Tasks with no due_date are excluded — there is nothing to bucket them by. Each bucket
    reports the cumulative count of tasks *due by the end of that month* vs how many of
    those are DONE, so the series shows completion tracking against schedule over time."""
    dated = sorted((t for t in tasks if t.due_date is not None), key=lambda t: t.due_date)
    if not dated:
        return []

    start = _month_start(dated[0].due_date)
    end = _month_start(dated[-1].due_date)

    points: list[TaskCompletionPoint] = []
    bucket_start = start
    while bucket_start <= end:
        bucket_end = _next_month(bucket_start)
        due_by_end = [t for t in dated if t.due_date < bucket_end]
        completed_by_end = sum(1 for t in due_by_end if t.status == TaskStatus.DONE)
        total = len(due_by_end)
        rate = round(100.0 * completed_by_end / total, 2) if total else 0.0
        points.append(
            TaskCompletionPoint(
                period=bucket_start.strftime("%Y-%m"),
                period_end=bucket_end - timedelta(days=1),
                tasks_due_cumulative=total,
                tasks_completed_cumulative=completed_by_end,
                completion_rate_pct=rate,
            )
        )
        bucket_start = bucket_end
    return points


def build_risk_snapshot(risks: list[Risk]) -> RiskSnapshot:
    """Current risk-severity distribution + open/closed counts. Explicitly a snapshot, not
    a trend — see RiskSnapshot's docstring for why (no risk-history table exists)."""
    severity_counts = {"LOW": 0, "MEDIUM": 0, "HIGH": 0, "CRITICAL": 0}
    status_counts = {"OPEN": 0, "MITIGATING": 0, "CLOSED": 0}
    for r in risks:
        severity_counts[derive_risk_severity(r.probability * r.impact).value] += 1
        status_counts[r.status.value] += 1

    open_count = status_counts["OPEN"] + status_counts["MITIGATING"]
    closed_count = status_counts["CLOSED"]
    return RiskSnapshot(
        as_of=date.today(),
        severity_counts=severity_counts,
        status_counts=status_counts,
        open_count=open_count,
        closed_count=closed_count,
        note=(
            "Point-in-time snapshot of the current risk register, not a historical trend — "
            "no risk-history table exists yet to derive severity-over-time from."
        ),
    )
