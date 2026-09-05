from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import StageGateNumber, StageGateStatus
from app.schemas.ai import AIResponse
from app.schemas.common import MoneyField
from app.schemas.project import MonteCarloForecastOut

# ---- EVM (no table — computed on read by app/services/evm.py) ----


class EVMAnomalyOut(BaseModel):
    metric: str
    value: float
    level: str
    message: str


class EVMOut(BaseModel):
    project_id: UUID
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
    anomalies: list[EVMAnomalyOut]


# ---- What-If Scenario Engine (no table -- computed on read by app/services/whatif.py; never
# persists anything, so there is no create/update/delete counterpart) ----


class WhatIfRequest(BaseModel):
    delay_days: int = Field(default=0, ge=-365, le=730)
    budget_delta: float = Field(default=0.0, ge=-100_000_000, le=100_000_000)
    scope_change_percent: float = Field(default=0.0, ge=-100, le=500)


class WhatIfScenarioOut(BaseModel):
    evm: EVMOut
    monte_carlo: MonteCarloForecastOut


class WhatIfResultOut(BaseModel):
    project_id: UUID
    baseline: WhatIfScenarioOut
    scenario: WhatIfScenarioOut
    inputs: WhatIfRequest


# ---- RACI ----


class RaciEntryCreate(BaseModel):
    task_or_deliverable: str = Field(min_length=1, max_length=255)
    responsible_id: UUID | None = None
    accountable_id: UUID | None = None
    consulted_id: UUID | None = None
    informed_id: UUID | None = None
    notes: str | None = None


class RaciEntryUpdate(BaseModel):
    task_or_deliverable: str | None = None
    responsible_id: UUID | None = None
    accountable_id: UUID | None = None
    consulted_id: UUID | None = None
    informed_id: UUID | None = None
    notes: str | None = None


class RaciEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    task_or_deliverable: str
    responsible_id: UUID | None
    responsible_name: str | None = None
    accountable_id: UUID | None
    accountable_name: str | None = None
    consulted_id: UUID | None
    consulted_name: str | None = None
    informed_id: UUID | None
    informed_name: str | None = None
    notes: str | None


# ---- Stage Gates ----


class StageGateCreate(BaseModel):
    gate: StageGateNumber
    name: str = Field(min_length=1, max_length=255)
    status: StageGateStatus = StageGateStatus.PENDING
    approver: str | None = None
    notes: str | None = None


class StageGateUpdate(BaseModel):
    name: str | None = None
    status: StageGateStatus | None = None
    approver: str | None = None
    notes: str | None = None
    # Explicit override only — normally sign-off timestamping is server-derived (see
    # app/api/pmo.py::update_stage_gate). Left settable for administrative correction only.
    signed_off_at: datetime | None = None


class StageGateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    gate: StageGateNumber
    name: str
    status: StageGateStatus
    approver: str | None
    signed_off_at: datetime | None
    notes: str | None


# ---- Contract Ledger ----


class ContractLedgerUpdate(BaseModel):
    total_contract_value: Decimal | None = Field(default=None, ge=0)
    billed_to_date: Decimal | None = Field(default=None, ge=0)
    wip: Decimal | None = Field(default=None, ge=0)
    currency: str | None = None


class ContractLedgerOut(BaseModel):
    project_id: UUID
    total_contract_value: MoneyField
    billed_to_date: MoneyField
    wip: MoneyField
    currency: str
    earned_value: float
    cost_variance: float
    margin_leakage_pct: float
    expected_billing_at_progress: float
    billing_gap: float
    scope_creep_flag: bool
    planned_margin_pct: float
    current_margin_pct: float


# ---- Boardroom Memo (generated on demand — never persisted, see app/api/pmo.py) ----


class TradeOffOptionOut(BaseModel):
    key: str
    title: str
    description: str
    new_forecast_cost: float
    variance_vs_budget: float
    assumptions: list[str]
    details: dict[str, Any]


class BoardroomMemoOut(BaseModel):
    project_id: UUID
    project_name: str
    generated_at: datetime
    narrative: AIResponse
    options: list[TradeOffOptionOut]
