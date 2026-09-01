from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import CurrentPrincipal, get_current_principal, require_write_access
from app.models.budget import Budget, BudgetTransaction
from app.repositories.budgets import get_budget, list_transactions
from app.repositories.projects import get_project
from app.schemas.budget import BudgetOut, BudgetSummary, BudgetTransactionCreate, BudgetTransactionOut
from app.services.audit import log_audit_event

router = APIRouter(prefix="/api/v1/projects", tags=["budget"])


@router.get("/{project_id}/budget", response_model=BudgetOut)
def get_project_budget(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> BudgetOut:
    project = get_project(db, principal.organization_id, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project not found")
    budget = get_budget(db, principal.organization_id, project_id)
    transactions = list_transactions(db, principal.organization_id, project_id)

    initial_budget = budget.initial_budget if budget else project.budget
    currency = budget.currency if budget else "USD"
    actual_cost = project.actual_cost
    remaining = initial_budget - actual_cost
    spent_percent = float(actual_cost / initial_budget * 100) if initial_budget else 0.0

    return BudgetOut(
        budget=BudgetSummary(
            id=budget.id if budget else None,
            project_id=project_id,
            initial_budget=initial_budget,
            currency=currency,
        ),
        transactions=[BudgetTransactionOut.model_validate(t) for t in transactions],
        actual_cost=actual_cost,
        remaining=remaining,
        spent_percent=round(spent_percent, 2),
    )


@router.post(
    "/{project_id}/budget/transactions",
    response_model=BudgetTransactionOut,
    status_code=status.HTTP_201_CREATED,
)
def create_budget_transaction(
    project_id: UUID,
    payload: BudgetTransactionCreate,
    principal: CurrentPrincipal = Depends(require_write_access),
    db: Session = Depends(get_db),
) -> BudgetTransaction:
    project = get_project(db, principal.organization_id, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="project not found")

    budget = get_budget(db, principal.organization_id, project_id)
    if budget is None:
        budget = Budget(project_id=project_id, initial_budget=project.budget, currency="USD")
        db.add(budget)

    transaction = BudgetTransaction(project_id=project_id, **payload.model_dump())
    db.add(transaction)

    # Keep the project's rolling actual_cost in sync with recorded transactions.
    project.actual_cost = (project.actual_cost or 0) + payload.amount

    db.commit()
    db.refresh(transaction)
    log_audit_event(
        db,
        organization_id=principal.organization_id,
        actor_user_id=principal.user_id,
        action="budget.transaction_created",
        entity_type="budget_transaction",
        entity_id=transaction.id,
        metadata={
            "project_id": str(project_id),
            "amount": str(transaction.amount),
            "category": transaction.category,
        },
    )
    return transaction
