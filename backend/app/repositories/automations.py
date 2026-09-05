from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.automation import AutomationLog, AutomationRule


def list_automation_rules(db: Session, organization_id: UUID) -> list[AutomationRule]:
    stmt = (
        select(AutomationRule)
        .where(AutomationRule.organization_id == organization_id)
        .order_by(AutomationRule.created_at)
    )
    return list(db.scalars(stmt).all())


def list_or_seed_automation_rules(db: Session, organization_id: UUID) -> list[AutomationRule]:
    """Every org gets the same fixed catalog of 3 standard enterprise triggers (see
    app/services/automation_engine.py's STANDARD_RULES) -- provisioned lazily on first read rather
    than via a migration-time data seed tied to one specific org id, so this works identically for
    the demo org and any real account's own org. Idempotent: a second call for the same org is a
    no-op once the rows exist."""
    existing = list_automation_rules(db, organization_id)
    if existing:
        return existing

    from app.services.automation_engine import STANDARD_RULES

    rows = [
        AutomationRule(
            organization_id=organization_id,
            name=spec["name"],
            trigger_type=spec["trigger_type"],
            condition_json={},
            action_type=spec["action_type"],
            action_params_json={},
            is_active=True,
        )
        for spec in STANDARD_RULES
    ]
    db.add_all(rows)
    db.commit()
    for row in rows:
        db.refresh(row)
    return rows


def get_automation_rule(db: Session, organization_id: UUID, rule_id: UUID) -> AutomationRule | None:
    stmt = select(AutomationRule).where(
        AutomationRule.organization_id == organization_id, AutomationRule.id == rule_id
    )
    return db.scalar(stmt)


def list_automation_logs(db: Session, organization_id: UUID, rule_id: UUID, limit: int = 50) -> list[AutomationLog]:
    stmt = (
        select(AutomationLog)
        .where(AutomationLog.organization_id == organization_id, AutomationLog.rule_id == rule_id)
        .order_by(AutomationLog.triggered_at.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())
