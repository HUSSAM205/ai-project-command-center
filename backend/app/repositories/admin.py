from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.ai_request import AIRequest
from app.models.organization import Organization
from app.models.project import Project
from app.models.user import User


def list_org_users(db: Session, organization_id: UUID) -> list[User]:
    stmt = select(User).where(User.organization_id == organization_id).order_by(User.created_at)
    return list(db.scalars(stmt).all())


def get_organization(db: Session, organization_id: UUID) -> Organization | None:
    return db.get(Organization, organization_id)


def count_org_users(db: Session, organization_id: UUID) -> int:
    return db.scalar(select(func.count()).select_from(User).where(User.organization_id == organization_id)) or 0


def count_org_projects(db: Session, organization_id: UUID) -> int:
    return db.scalar(select(func.count()).select_from(Project).where(Project.organization_id == organization_id)) or 0


def aggregate_ai_usage(db: Session, organization_id: UUID, since: datetime) -> dict:
    """Aggregates real rows from `ai_requests` (populated by every AIRouter.dispatch() call —
    see app/ai/router.py) into request counts / success rate / avg latency / provider
    breakdown. Reads the existing table rather than introducing a second source of truth for
    AI usage telemetry."""
    stmt = select(AIRequest).where(AIRequest.organization_id == organization_id, AIRequest.created_at >= since)
    rows = list(db.scalars(stmt).all())

    total = len(rows)
    successes = sum(1 for r in rows if r.success)
    avg_latency = (sum(r.latency_ms for r in rows) / total) if total else 0.0

    by_provider: dict[str, dict[str, int]] = {}
    for r in rows:
        bucket = by_provider.setdefault(r.provider_used, {"count": 0, "successes": 0, "latency_sum": 0})
        bucket["count"] += 1
        bucket["successes"] += 1 if r.success else 0
        bucket["latency_sum"] += r.latency_ms

    breakdown = [
        {
            "provider": provider,
            "request_count": bucket["count"],
            "success_rate": round(bucket["successes"] / bucket["count"] * 100, 1) if bucket["count"] else 0.0,
            "avg_latency_ms": round(bucket["latency_sum"] / bucket["count"], 1) if bucket["count"] else 0.0,
        }
        for provider, bucket in sorted(by_provider.items(), key=lambda kv: -kv[1]["count"])
    ]

    return {
        "total_requests": total,
        "success_rate": round(successes / total * 100, 1) if total else 0.0,
        "avg_latency_ms": round(avg_latency, 1),
        "provider_breakdown": breakdown,
    }
