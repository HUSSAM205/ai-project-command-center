"""Deterministic steering-committee trade-off calculator for the boardroom memo
(POST /api/v1/projects/{id}/boardroom-memo, app/api/pmo.py).

Every number below is derived from this project's real EVM result (app/services/evm.py),
its real contract ledger (app/services/contract_ledger.py), and its real seeded tasks/resources
— never invented. Only the AI-generated portion of the boardroom memo is the executive
narrative framing, dispatched through the existing AIRouter (see app/api/pmo.py), same pattern
as every other AI-touching endpoint in this app; it is handed these exact computed numbers via
app/ai/context.py::build_project_context and can only describe what is actually here.

Three explicit trade-off options, each with documented assumptions:

1. Cost/Schedule Trade-off ("crash" the schedule to recover the current SPI shortfall):
   schedule_slip_days = round((1 - SPI) * total_schedule_days), floored at 0
   recovery_hours     = schedule_slip_days * 8   (assume 8 focused catch-up hours/day of slip)
   crash_premium      = 1.4   (documented assumption: expediting already-committed work costs a
                                40% premium over the blended rate — overtime/expedite premium,
                                a standard project-crashing rule of thumb)
   additional_cost    = recovery_hours * blended_hourly_rate * crash_premium
   new_forecast_cost  = EAC + additional_cost

2. De-scoping (cut not-yet-started, lowest-priority scope to absorb a cost overrun):
   target_reduction   = max(0, EAC - BAC)   (the VAC shortfall, if any)
   Candidate tasks: TODO tasks only (nothing already started is touched), sorted LOW priority
   first then by estimated_hours descending (cut the biggest low-priority items first), greedily
   accumulated until their combined dollar value (estimated_hours * blended_hourly_rate) covers
   target_reduction (or candidates run out — reported honestly if so).
   new_forecast_cost  = EAC - total_value_descoped

3. Surge Resourcing (add headcount to recover schedule without cutting scope):
   additional_fte     = max(1, ceil(schedule_slip_days / 20))   (1 extra FTE absorbs ~4 working
                                weeks — 20 working days — of slip; documented heuristic)
   surge_weeks        = min(8, max(1, ceil(remaining_days / 7)))   (surge for the remaining
                                schedule, capped at 8 weeks so the option stays bounded)
   surge_cost         = additional_fte * blended_hourly_rate * 40 * surge_weeks   (40 hr/week,
                                no crash premium — this is added capacity, not expedited work)
   new_forecast_cost  = EAC + surge_cost
"""

import math
from dataclasses import dataclass, field

from app.models.enums import Priority, TaskStatus
from app.models.task import Task
from app.services.contract_ledger import ContractLedgerResult
from app.services.evm import EVMResult

CRASH_PREMIUM = 1.4
CATCHUP_HOURS_PER_SLIP_DAY = 8
FTE_PER_SLIP_DAYS = 20
SURGE_HOURS_PER_WEEK = 40
SURGE_WEEKS_CAP = 8

_PRIORITY_ORDER = {Priority.LOW: 0, Priority.MEDIUM: 1, Priority.HIGH: 2, Priority.CRITICAL: 3}


@dataclass
class TradeOffOption:
    key: str
    title: str
    description: str
    new_forecast_cost: float
    variance_vs_budget: float
    assumptions: list[str]
    details: dict = field(default_factory=dict)


def _blended_hourly_rate(hourly_costs: list[float]) -> float:
    values = [c for c in hourly_costs if c and c > 0]
    return round(sum(values) / len(values), 2) if values else 0.0


def _schedule_slip_days(spi: float | None, total_days: int) -> int:
    if spi is None or spi >= 1.0:
        return 0
    return max(0, round((1 - spi) * total_days))


def _option_cost_schedule(evm: EVMResult, total_days: int, blended_rate: float) -> TradeOffOption:
    slip_days = _schedule_slip_days(evm.spi, total_days)
    recovery_hours = slip_days * CATCHUP_HOURS_PER_SLIP_DAY
    additional_cost = round(recovery_hours * blended_rate * CRASH_PREMIUM, 2)
    new_forecast = round(evm.eac + additional_cost, 2)
    return TradeOffOption(
        key="cost_schedule",
        title="Cost/Schedule Trade-off",
        description=(
            f"Crash the schedule to close a {slip_days}-day slip (SPI {evm.spi:.2f})"
            if evm.spi is not None
            else "No schedule slip detected — crashing is not required."
        ),
        new_forecast_cost=new_forecast,
        variance_vs_budget=round(new_forecast - evm.bac, 2),
        assumptions=[
            f"{CATCHUP_HOURS_PER_SLIP_DAY} catch-up hours per day of slip",
            f"{CRASH_PREMIUM}x expedite premium on the blended hourly rate (${blended_rate}/hr)",
        ],
        details={"schedule_slip_days": slip_days, "recovery_hours": recovery_hours, "additional_cost": additional_cost},
    )


def _option_descope(evm: EVMResult, tasks: list[Task], blended_rate: float) -> TradeOffOption:
    target_reduction = max(0.0, round(evm.eac - evm.bac, 2))
    candidates = sorted(
        (t for t in tasks if t.status == TaskStatus.TODO),
        key=lambda t: (_PRIORITY_ORDER.get(t.priority, 1), -(float(t.estimated_hours or 0))),
    )
    descoped: list[dict] = []
    total_value = 0.0
    for t in candidates:
        if total_value >= target_reduction > 0:
            break
        hours = float(t.estimated_hours or 0)
        value = round(hours * blended_rate, 2)
        if value <= 0:
            continue
        descoped.append({"title": t.title, "estimated_hours": hours, "estimated_value": value})
        total_value += value
    total_value = round(total_value, 2)
    new_forecast = round(evm.eac - total_value, 2)
    shortfall = round(max(0.0, target_reduction - total_value), 2)
    return TradeOffOption(
        key="descope",
        title="De-scoping",
        description=(
            f"Cut ${target_reduction:,.0f} of not-yet-started, lowest-priority scope to protect the original budget."
            if target_reduction > 0
            else "No cost overrun to absorb — de-scoping is not required."
        ),
        new_forecast_cost=new_forecast,
        variance_vs_budget=round(new_forecast - evm.bac, 2),
        assumptions=[
            "Only TODO (not-yet-started) tasks are candidates for descoping",
            "Lowest priority, largest estimated_hours cut first",
            f"Task value estimated at the ${blended_rate}/hr blended rate",
        ],
        details={
            "target_reduction": target_reduction,
            "descoped_tasks": descoped,
            "total_value_descoped": total_value,
            "shortfall": shortfall,
        },
    )


def _option_surge(evm: EVMResult, total_days: int, elapsed_days: int, blended_rate: float) -> TradeOffOption:
    slip_days = _schedule_slip_days(evm.spi, total_days)
    remaining_days = max(1, total_days - elapsed_days)
    additional_fte = max(1, math.ceil(slip_days / FTE_PER_SLIP_DAYS)) if slip_days > 0 else 0
    surge_weeks = min(SURGE_WEEKS_CAP, max(1, math.ceil(remaining_days / 7)))
    surge_cost = round(additional_fte * blended_rate * SURGE_HOURS_PER_WEEK * surge_weeks, 2)
    new_forecast = round(evm.eac + surge_cost, 2)
    return TradeOffOption(
        key="surge_resourcing",
        title="Surge Resourcing",
        description=(
            f"Add {additional_fte} FTE for {surge_weeks} week(s) to recover the schedule without cutting scope."
            if additional_fte > 0
            else "No schedule slip detected — surge resourcing is not required."
        ),
        new_forecast_cost=new_forecast,
        variance_vs_budget=round(new_forecast - evm.bac, 2),
        assumptions=[
            f"1 additional FTE absorbs ~{FTE_PER_SLIP_DAYS} working days of slip",
            f"Surge capped at {SURGE_WEEKS_CAP} weeks, {SURGE_HOURS_PER_WEEK} hr/week, no expedite premium",
        ],
        details={"additional_fte": additional_fte, "surge_weeks": surge_weeks, "surge_cost": surge_cost},
    )


def compute_trade_off_options(
    evm: EVMResult,
    contract_ledger: ContractLedgerResult,
    tasks: list[Task],
    hourly_costs: list[float],
    total_days: int,
    elapsed_days: int,
) -> list[TradeOffOption]:
    blended_rate = _blended_hourly_rate(hourly_costs)
    return [
        _option_cost_schedule(evm, total_days, blended_rate),
        _option_descope(evm, tasks, blended_rate),
        _option_surge(evm, total_days, elapsed_days, blended_rate),
    ]
