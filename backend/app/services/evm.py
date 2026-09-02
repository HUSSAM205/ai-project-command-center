"""Deterministic Earned Value Management (EVM) engine. No randomness, no AI calls — same
transparency standard as app/services/health_score.py and app/services/cost_forecast.py.

Formulas (standard EVM terminology; BAC = Budget At Completion = Project.budget):

    PV (Planned Value)  = planned_pct/100 * BAC
        planned_pct is the same "how far through the schedule should we be" figure
        health_score.py's schedule_penalty uses (see app/services/common.py::compute_planned_pct)
        — the two engines share one schedule baseline so they can never silently disagree.

    EV (Earned Value)   = (progress/100) * BAC
        Budgeted cost of work actually performed, per standard EVM — this is the same quantity
        app/services/cost_forecast.py calls `earned_value`, just computed unconditionally here
        (cost_forecast.py only sets it when progress>0 and actual_cost>0, to guard its own CPI
        division; EVM's own definition of EV has no such guard, so it is recomputed identically
        rather than reusing a sometimes-None value).

    AC (Actual Cost)    = Project.actual_cost  (already tracked, not recomputed)

    CPI (Cost Performance Index)     = EV / AC
    SPI (Schedule Performance Index) = EV / PV

    EAC (Estimate At Completion) — **reused verbatim from app/services/cost_forecast.py's
        `forecasted_final_cost`**, not recomputed independently, so GET /projects/{id}/evm and
        GET /projects/{id}/forecast can never disagree about the forecast. cost_forecast.py's
        rule: EAC = BAC / CPI when progress>0 and actual_cost>0, else EAC = BAC (insufficient
        data baseline). Because cost_forecast.py's CPI uses the exact same EV/AC formula as
        above, this module's `cpi` field is also taken directly from cost_forecast.py's result
        for full reconciliation — never a second, slightly-different CPI number.

    VAC (Variance At Completion) = BAC - EAC   (negative = projected overrun)

Anomaly thresholds (documented, not tunable at runtime):
    CPI or SPI < 0.80  -> "critical"  (>20% cost/schedule inefficiency)
    CPI or SPI < 0.90  -> "warning"   (>10% cost/schedule inefficiency)
    otherwise          -> no flag

Worked example (AI Customer Intelligence, seeded: budget=500000, actual_cost=330000,
progress=68, start 2026-03-01, end 2026-12-01, "today" 2026-09-01):
    total_days=275, elapsed_days=184 -> planned_pct=66.9%
    PV = 0.669 * 500000        = 334,545.45
    EV = 0.68  * 500000        = 340,000.00
    AC = 330,000.00
    CPI = 340000/330000        = 1.0303  (under budget for value delivered -> no flag)
    SPI = 340000/334545.45     = 1.0163  (slightly ahead of schedule -> no flag)
    EAC (from cost_forecast)   = 500000/1.0303 ~= 485,294.12
    VAC = 500000 - 485294.12   = 14,705.88  (positive -> projected to finish under budget)
"""

from dataclasses import dataclass
from datetime import date

from app.models.project import Project
from app.services.common import compute_planned_pct
from app.services.cost_forecast import compute_cost_forecast

CRITICAL_THRESHOLD = 0.80
WARNING_THRESHOLD = 0.90


@dataclass
class EVMAnomaly:
    metric: str  # "CPI" | "SPI"
    value: float
    level: str  # "warning" | "critical"
    message: str


@dataclass
class EVMResult:
    bac: float
    pv: float
    ev: float
    ac: float
    cpi: float | None
    spi: float | None
    eac: float
    vac: float
    planned_pct: float
    progress: float
    method: str
    anomalies: list[EVMAnomaly]


def _flag(metric: str, value: float | None) -> EVMAnomaly | None:
    if value is None:
        return None
    if value < CRITICAL_THRESHOLD:
        return EVMAnomaly(
            metric=metric,
            value=round(value, 4),
            level="critical",
            message=f"{metric} {value:.2f} is below the {CRITICAL_THRESHOLD} critical threshold.",
        )
    if value < WARNING_THRESHOLD:
        return EVMAnomaly(
            metric=metric,
            value=round(value, 4),
            level="warning",
            message=f"{metric} {value:.2f} is below the {WARNING_THRESHOLD} warning threshold.",
        )
    return None


def compute_evm(project: Project, today: date | None = None) -> EVMResult:
    today = today or date.today()

    bac = float(project.budget or 0)
    ac = float(project.actual_cost or 0)
    progress = float(project.progress or 0)

    planned_pct, _total_days, _elapsed_days = compute_planned_pct(project.start_date, project.end_date, today)

    pv = (planned_pct / 100.0) * bac
    ev = (progress / 100.0) * bac

    forecast = compute_cost_forecast(project)  # reconciled EAC/CPI — see module docstring
    eac = forecast.forecasted_final_cost
    cpi = forecast.cpi  # None when progress<=0 or actual_cost<=0, same guard as cost_forecast.py
    spi = (ev / pv) if pv > 0 else None
    vac = bac - eac

    anomalies = [a for a in (_flag("CPI", cpi), _flag("SPI", spi)) if a is not None]

    return EVMResult(
        bac=round(bac, 2),
        pv=round(pv, 2),
        ev=round(ev, 2),
        ac=round(ac, 2),
        cpi=cpi,
        spi=round(spi, 4) if spi is not None else None,
        eac=eac,
        vac=round(vac, 2),
        planned_pct=round(planned_pct, 2),
        progress=progress,
        method=forecast.method,
        anomalies=anomalies,
    )
