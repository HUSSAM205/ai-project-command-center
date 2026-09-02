"""Deterministic contract ledger / margin leakage tracker. No randomness, no AI calls — same
transparency standard as every other engine in this app.

Inputs: a project's ContractLedger row (total_contract_value=TCV, billed_to_date, wip — work in
progress, unbilled) plus the project's own budget/actual_cost/progress. `margin_leakage_pct` is
never persisted (see app/models/pmo.py::ContractLedger docstring) — computed fresh every read.

Formula:

    EV (earned value) = (progress/100) * budget
        Reused verbatim from app/services/evm.py's EV, NOT recomputed independently, so this
        endpoint's numbers reconcile with GET /projects/{id}/evm.

    cost_variance = actual_cost - EV
        Positive means the project has spent more than the EVM baseline says should have been
        spent for the progress actually made — i.e. cost is outrunning delivered value. This is
        the "scope-creep-shaped variance" the spec asks for: cost growing disproportionately to
        completed work, rather than a plain over/under-budget check.

    margin_leakage_pct = clamp(cost_variance / TCV * 100, 0, 100)   (0 if TCV <= 0)
        Expressed as a percentage of total contract value — "how much of the deal's value has
        been eaten by cost running ahead of earned progress." Floored at 0: underspending
        relative to progress is not leakage (it's contingency being preserved), so it is not
        reported as a negative leakage figure.

    expected_billing_at_progress = TCV * (progress/100)
    billing_gap = expected_billing_at_progress - billed_to_date
        Positive means the project is under-billed for the progress made (revenue recognition
        lagging delivery — a separate, complementary signal from margin_leakage_pct).

    scope_creep_flag = cost_variance > 0 and billing_gap > 0
        Both signals firing together — cost outrunning earned progress AND billing lagging
        progress — is the specific pattern that looks like scope creep (doing more/costlier
        work than what was priced and billed for), as opposed to either signal alone (which
        could just be timing/invoicing-cadence noise).

    planned_margin_pct = (TCV - budget) / TCV * 100        (0 if TCV <= 0)
    current_margin_pct = (TCV - actual_cost) / TCV * 100   (0 if TCV <= 0)
        Gross margin at contract signing vs. gross margin implied by cost incurred so far,
        both as a % of TCV — for the UI to show margin erosion at a glance.

Worked example (Digital Transformation Program, seeded: budget=800000, actual_cost=700000,
progress=38; contract ledger seeded TCV=1,150,000, billed_to_date=420,000, wip=95,000):
    EV = 0.38 * 800000                 = 304,000.00
    cost_variance = 700000 - 304000    = 396,000.00   (spending far ahead of earned progress)
    margin_leakage_pct = 396000/1150000*100 ~= 34.43%
    expected_billing_at_progress = 1150000 * 0.38      = 437,000.00
    billing_gap = 437000 - 420000                      = 17,000.00  (slightly under-billed)
    scope_creep_flag = True (cost_variance>0 and billing_gap>0)
    planned_margin_pct = (1150000-800000)/1150000*100  ~= 30.43%
    current_margin_pct = (1150000-700000)/1150000*100  ~= 39.13%
"""

from dataclasses import dataclass

from app.models.pmo import ContractLedger
from app.models.project import Project
from app.services.common import clamp


@dataclass
class ContractLedgerResult:
    total_contract_value: float
    billed_to_date: float
    wip: float
    currency: str
    earned_value: float
    cost_variance: float
    margin_leakage_pct: float
    expected_billing_at_progress: float
    billing_gap: float
    scope_creep_flag: bool
    planned_margin_pct: float
    current_margin_pct: float


def compute_contract_ledger_metrics(project: Project, ledger: ContractLedger | None) -> ContractLedgerResult:
    tcv = float(ledger.total_contract_value) if ledger else 0.0
    billed = float(ledger.billed_to_date) if ledger else 0.0
    wip = float(ledger.wip) if ledger else 0.0
    currency = ledger.currency if ledger else "USD"

    budget = float(project.budget or 0)
    actual_cost = float(project.actual_cost or 0)
    progress = float(project.progress or 0)

    earned_value = (progress / 100.0) * budget
    cost_variance = actual_cost - earned_value
    margin_leakage_pct = clamp((cost_variance / tcv) * 100.0, 0, 100) if tcv > 0 else 0.0

    expected_billing_at_progress = tcv * (progress / 100.0)
    billing_gap = expected_billing_at_progress - billed
    scope_creep_flag = cost_variance > 0 and billing_gap > 0

    planned_margin_pct = ((tcv - budget) / tcv * 100.0) if tcv > 0 else 0.0
    current_margin_pct = ((tcv - actual_cost) / tcv * 100.0) if tcv > 0 else 0.0

    return ContractLedgerResult(
        total_contract_value=round(tcv, 2),
        billed_to_date=round(billed, 2),
        wip=round(wip, 2),
        currency=currency,
        earned_value=round(earned_value, 2),
        cost_variance=round(cost_variance, 2),
        margin_leakage_pct=round(margin_leakage_pct, 2),
        expected_billing_at_progress=round(expected_billing_at_progress, 2),
        billing_gap=round(billing_gap, 2),
        scope_creep_flag=scope_creep_flag,
        planned_margin_pct=round(planned_margin_pct, 2),
        current_margin_pct=round(current_margin_pct, 2),
    )
