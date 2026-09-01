"""Deterministic Cost Forecast (EVM baseline). No randomness, no AI calls.

Always labeled a transparent "baseline estimate" — never presented as an ML forecast,
per docs/ARCHITECTURE.md.
"""

from dataclasses import dataclass

from app.models.project import Project
from app.services.common import clamp


@dataclass
class CostForecastResult:
    forecasted_final_cost: float
    variance: float
    variance_percent: float
    overrun_probability: float
    method: str
    cpi: float | None
    earned_value: float | None


def compute_cost_forecast(project: Project) -> CostForecastResult:
    budget = float(project.budget or 0)
    actual_cost = float(project.actual_cost or 0)
    progress = project.progress or 0

    cpi: float | None = None
    earned_value: float | None = None

    if progress <= 0 or actual_cost <= 0:
        forecasted_final_cost = budget
        method = "insufficient data — using budget as baseline"
    else:
        earned_value = (progress / 100.0) * budget
        cpi = earned_value / actual_cost if actual_cost > 0 else 0.0
        forecasted_final_cost = (budget / cpi) if cpi > 0 else budget
        method = "baseline estimate (EVM: EAC = BAC / CPI)"

    variance = forecasted_final_cost - budget
    variance_percent = (variance / budget) * 100.0 if budget > 0 else 0.0

    if variance > 0:
        overrun_probability = clamp(5 + variance_percent * 1.2, 0, 95)
    else:
        overrun_probability = clamp(15 + variance_percent * 0.5, 0, 20)

    return CostForecastResult(
        forecasted_final_cost=round(forecasted_final_cost, 2),
        variance=round(variance, 2),
        variance_percent=round(variance_percent, 2),
        overrun_probability=round(overrun_probability, 2),
        method=method,
        cpi=round(cpi, 4) if cpi is not None else None,
        earned_value=round(earned_value, 2) if earned_value is not None else None,
    )
