from datetime import date as date_type
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import MoneyField


class BudgetTransactionCreate(BaseModel):
    description: str | None = None
    amount: Decimal
    category: str | None = None
    date: date_type | None = None


class BudgetTransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    description: str | None
    amount: MoneyField
    category: str | None
    date: date_type | None


class BudgetSummary(BaseModel):
    id: UUID | None
    project_id: UUID
    initial_budget: MoneyField
    currency: str


class BudgetOut(BaseModel):
    budget: BudgetSummary
    transactions: list[BudgetTransactionOut] = Field(default_factory=list)
    actual_cost: MoneyField
    remaining: MoneyField
    spent_percent: float
