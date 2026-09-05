"""What-If Scenario Engine.

Recomputes EVM (app/services/evm.py) and the historical-ratio Monte Carlo forecast
(app/services/monte_carlo.py) against a hypothetical project state -- entirely in memory. This
module never calls db.add()/db.commit()/db.flush(); the "scenario" Project instance built below is
a transient, unattached SQLAlchemy object that is never added to a session, so nothing here can
ever persist. Reuses the exact same formulas the live EVM/Monte Carlo endpoints use and only ever
varies their *inputs* -- a scenario recalculation can never disagree with the real math it started
from, because it is not a second, independently-written formula set.

Three optional levers, matching what an executive would actually ask "what if we..." about:
  - delay_days: shifts the project's effective deadline outward (EVM's planned_pct is schedule-
    sensitive) and is added directly to each Monte Carlo percentile date.
  - budget_delta: added to the effective BAC (can be negative, i.e. a budget cut).
  - scope_change_percent: scales every incomplete task's remaining estimated hours by
    (1 + percent/100) before the Monte Carlo simulation runs -- added scope takes longer to
    deliver, cut scope less. Deliberately does not touch EVM's BAC on its own (a scope change
    without an explicit budget_delta is modeled as "same budget, different amount of work" - the
    two levers are independent by design, and can be combined in one call).
"""

from dataclasses import dataclass, field
from datetime import date, timedelta
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.project import Project
from app.services.evm import EVMResult, compute_evm
from app.services.monte_carlo import (
    SIMULATION_RUNS,
    MonteCarloForecast,
    _describe_method,
    _gather_inputs,
    _run_simulation,
)


@dataclass
class WhatIfInputs:
    delay_days: int = 0
    budget_delta: float = 0.0
    scope_change_percent: float = 0.0


@dataclass
class WhatIfScenario:
    evm: EVMResult
    monte_carlo: MonteCarloForecast


@dataclass
class WhatIfResult:
    baseline: WhatIfScenario
    scenario: WhatIfScenario
    inputs: WhatIfInputs = field(default_factory=WhatIfInputs)


def _monte_carlo_from(
    project_id: str,
    base_remaining_hours: list[float],
    historical: list[float],
    weekly_capacity: float,
    today: date,
    remaining_count: int,
    *,
    extra_delay_days: int = 0,
    seed: int | None = None,
) -> MonteCarloForecast:
    if remaining_count == 0:
        return MonteCarloForecast(
            project_id=project_id,
            p50_date=today,
            p85_date=today,
            p95_date=today,
            remaining_task_count=0,
            remaining_hours_estimate=0.0,
            weekly_capacity_hours=round(weekly_capacity, 1),
            historical_sample_size=len(historical),
            method="no remaining tasks — project is complete",
            runs=0,
        )
    p50, p85, p95 = _run_simulation(base_remaining_hours, historical, weekly_capacity, today, seed=seed)
    delay = timedelta(days=extra_delay_days)
    return MonteCarloForecast(
        project_id=project_id,
        p50_date=p50 + delay,
        p85_date=p85 + delay,
        p95_date=p95 + delay,
        remaining_task_count=remaining_count,
        remaining_hours_estimate=round(sum(base_remaining_hours), 1),
        weekly_capacity_hours=round(weekly_capacity, 1),
        historical_sample_size=len(historical),
        method=_describe_method(len(historical)),
        runs=SIMULATION_RUNS,
    )


def compute_what_if(
    db: Session,
    organization_id: UUID,
    project: Project,
    inputs: WhatIfInputs,
    *,
    seed: int | None = None,
) -> WhatIfResult:
    today = date.today()
    base_remaining_hours, historical, weekly_capacity, remaining_count = _gather_inputs(
        db, organization_id, project
    )

    baseline_evm = compute_evm(project, today)
    baseline_mc = _monte_carlo_from(
        str(project.id), base_remaining_hours, historical, weekly_capacity, today, remaining_count, seed=seed
    )

    # Transient, unattached Project -- never db.add()'d, so it can never be persisted. Only the
    # three fields EVM actually reads are varied; actual_cost and progress are historical facts,
    # not hypotheticals, so they carry over unchanged.
    scenario_budget = max(0.0, float(project.budget or 0) + inputs.budget_delta)
    scenario_end_date = (
        project.end_date + timedelta(days=inputs.delay_days) if project.end_date else project.end_date
    )
    scenario_project = Project(
        budget=scenario_budget,
        actual_cost=project.actual_cost,
        progress=project.progress,
        start_date=project.start_date,
        end_date=scenario_end_date,
    )
    scenario_evm = compute_evm(scenario_project, today)

    scope_multiplier = max(0.0, 1 + inputs.scope_change_percent / 100.0)
    scenario_remaining_hours = [h * scope_multiplier for h in base_remaining_hours]
    scenario_mc = _monte_carlo_from(
        str(project.id),
        scenario_remaining_hours,
        historical,
        weekly_capacity,
        today,
        remaining_count,
        extra_delay_days=inputs.delay_days,
        seed=seed,
    )

    return WhatIfResult(
        baseline=WhatIfScenario(evm=baseline_evm, monte_carlo=baseline_mc),
        scenario=WhatIfScenario(evm=scenario_evm, monte_carlo=scenario_mc),
        inputs=inputs,
    )
