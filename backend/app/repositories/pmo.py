"""All queries here are org-scoped via a join through Project (same pattern as
app/repositories/risks.py) — never accept an organization id from client input."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.pmo import ContractLedger, RaciEntry, StageGate
from app.models.project import Project


def list_raci_for_project(db: Session, organization_id: UUID, project_id: UUID) -> list[RaciEntry]:
    stmt = (
        select(RaciEntry)
        .join(Project, RaciEntry.project_id == Project.id)
        .where(Project.organization_id == organization_id, Project.id == project_id)
        .order_by(RaciEntry.created_at)
    )
    return list(db.scalars(stmt).all())


def get_raci_entry(db: Session, organization_id: UUID, raci_id: UUID) -> RaciEntry | None:
    stmt = (
        select(RaciEntry)
        .join(Project, RaciEntry.project_id == Project.id)
        .where(Project.organization_id == organization_id, RaciEntry.id == raci_id)
    )
    return db.scalar(stmt)


def list_stage_gates_for_project(db: Session, organization_id: UUID, project_id: UUID) -> list[StageGate]:
    stmt = (
        select(StageGate)
        .join(Project, StageGate.project_id == Project.id)
        .where(Project.organization_id == organization_id, Project.id == project_id)
        .order_by(StageGate.gate)
    )
    return list(db.scalars(stmt).all())


def get_stage_gate(db: Session, organization_id: UUID, stage_gate_id: UUID) -> StageGate | None:
    stmt = (
        select(StageGate)
        .join(Project, StageGate.project_id == Project.id)
        .where(Project.organization_id == organization_id, StageGate.id == stage_gate_id)
    )
    return db.scalar(stmt)


def get_contract_ledger(db: Session, organization_id: UUID, project_id: UUID) -> ContractLedger | None:
    stmt = (
        select(ContractLedger)
        .join(Project, ContractLedger.project_id == Project.id)
        .where(Project.organization_id == organization_id, ContractLedger.project_id == project_id)
    )
    return db.scalar(stmt)
