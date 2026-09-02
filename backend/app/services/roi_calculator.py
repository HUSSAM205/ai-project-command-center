"""Deterministic ROI Calculator (Phase 4 — Consulting Workspace, spec §38).

Pure formula, no AI, no randomness — same transparency discipline as
app/services/cost_forecast.py. `ROIResult.formula` documents the exact arithmetic used, so the
API/frontend can render it verbatim next to the numbers (same honesty pattern as
CostForecastResult.method).

Inputs (current_cost/annual_savings/maintenance_cost are annual figures; implementation_cost
is a one-time cost):
    current_cost               annual cost of doing things the current way today
    implementation_cost        one-time cost to build/deploy the AI solution
    expected_efficiency_gain   percent (0-100) of current_cost expected to be saved via efficiency
    annual_savings              additional direct annual savings/revenue the solution unlocks
    maintenance_cost            ongoing annual cost to run/maintain the solution

Formula:
    efficiency_savings    = current_cost * (expected_efficiency_gain / 100)
    annual_benefit         = annual_savings + efficiency_savings - maintenance_cost
    net_benefit             = annual_benefit - implementation_cost        (first-year net benefit)
    roi_percent             = (net_benefit / implementation_cost) * 100    (None if implementation_cost <= 0 — undefined, not zero)
    payback_period_months   = implementation_cost / (annual_benefit / 12)  (None if annual_benefit <= 0 — never pays back)
"""

from dataclasses import dataclass

FORMULA = (
    "efficiency_savings = current_cost × (expected_efficiency_gain / 100); "
    "annual_benefit = annual_savings + efficiency_savings − maintenance_cost; "
    "net_benefit = annual_benefit − implementation_cost; "
    "roi_percent = (net_benefit / implementation_cost) × 100; "
    "payback_period_months = implementation_cost / (annual_benefit / 12)"
)


@dataclass
class ROIResult:
    efficiency_savings: float
    annual_benefit: float
    net_benefit: float
    roi_percent: float | None
    payback_period_months: float | None
    formula: str


def compute_roi(
    current_cost: float,
    implementation_cost: float,
    expected_efficiency_gain: float,
    annual_savings: float,
    maintenance_cost: float,
) -> ROIResult:
    efficiency_savings = current_cost * (expected_efficiency_gain / 100.0)
    annual_benefit = annual_savings + efficiency_savings - maintenance_cost
    net_benefit = annual_benefit - implementation_cost

    roi_percent = (net_benefit / implementation_cost) * 100.0 if implementation_cost > 0 else None
    payback_period_months = (
        implementation_cost / (annual_benefit / 12.0)
        if annual_benefit > 0 and implementation_cost > 0
        else None
    )

    return ROIResult(
        efficiency_savings=round(efficiency_savings, 2),
        annual_benefit=round(annual_benefit, 2),
        net_benefit=round(net_benefit, 2),
        roi_percent=round(roi_percent, 2) if roi_percent is not None else None,
        payback_period_months=round(payback_period_months, 2) if payback_period_months is not None else None,
        formula=FORMULA,
    )
