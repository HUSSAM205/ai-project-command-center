"""All queries here are org-scoped by `organization_id` taken from the caller's JWT (via a
join through BusinessCase, the same pattern as app/repositories/risks.py). Never accept an
organization id from client input."""

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.consulting import AIOpportunity, BusinessCase, RoadmapPhase


def list_business_cases(db: Session, organization_id: UUID) -> list[BusinessCase]:
    stmt = (
        select(BusinessCase)
        .where(BusinessCase.organization_id == organization_id)
        .order_by(BusinessCase.created_at.desc())
    )
    return list(db.scalars(stmt).all())


def get_business_case(db: Session, organization_id: UUID, business_case_id: UUID) -> BusinessCase | None:
    stmt = select(BusinessCase).where(
        BusinessCase.organization_id == organization_id, BusinessCase.id == business_case_id
    )
    return db.scalar(stmt)


def list_opportunities_for_case(db: Session, organization_id: UUID, business_case_id: UUID) -> list[AIOpportunity]:
    stmt = (
        select(AIOpportunity)
        .join(BusinessCase, AIOpportunity.business_case_id == BusinessCase.id)
        .where(BusinessCase.organization_id == organization_id, BusinessCase.id == business_case_id)
        .order_by(AIOpportunity.created_at)
    )
    return list(db.scalars(stmt).all())


def get_opportunity(db: Session, organization_id: UUID, opportunity_id: UUID) -> AIOpportunity | None:
    stmt = (
        select(AIOpportunity)
        .join(BusinessCase, AIOpportunity.business_case_id == BusinessCase.id)
        .where(BusinessCase.organization_id == organization_id, AIOpportunity.id == opportunity_id)
    )
    return db.scalar(stmt)


def list_roadmap_phases_for_case(db: Session, organization_id: UUID, business_case_id: UUID) -> list[RoadmapPhase]:
    stmt = (
        select(RoadmapPhase)
        .join(BusinessCase, RoadmapPhase.business_case_id == BusinessCase.id)
        .where(BusinessCase.organization_id == organization_id, BusinessCase.id == business_case_id)
        .order_by(RoadmapPhase.sequence_order)
    )
    return list(db.scalars(stmt).all())


def delete_roadmap_phases_for_case(db: Session, business_case_id: UUID) -> None:
    """Called immediately before regenerating a roadmap — POST .../roadmap always replaces the
    prior 5 phases wholesale rather than trying to diff/merge them."""
    stmt = select(RoadmapPhase).where(RoadmapPhase.business_case_id == business_case_id)
    for phase in db.scalars(stmt).all():
        db.delete(phase)
    db.flush()
