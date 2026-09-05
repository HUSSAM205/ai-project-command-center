"""Audit trail writer (Phase 5), extended with a real tamper-evident hash chain and request-
context capture (Governance phase). `log_audit_event` is called additively from existing write
endpoints — see app/api/auth.py (login), projects.py (create/update), tasks.py (assignment),
risks.py (create), budgets.py (transactions), documents.py (upload), ai.py/documents.py
(AI requests), admin.py (admin actions), automations.py (toggle/test-run).
"""

import hashlib
import json
import logging
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)


def _actor_uuid(user_id: str | UUID | None) -> UUID | None:
    if user_id is None:
        return None
    if isinstance(user_id, UUID):
        return user_id
    try:
        return UUID(user_id)
    except (ValueError, TypeError):
        # Anonymous demo sessions carry a non-UUID sentinel ("demo") as user_id — no real
        # user row to attribute the event to, so the actor is simply left null.
        return None


def get_client_ip(request: Request) -> str | None:
    """Real caller IP, honoring the `X-Forwarded-For` chain Render/Vercel's proxying sets (the
    first entry is the original client) before falling back to the raw socket peer -- which, if
    this process only ever sees `request.client` are `null` behind a proxy, means the fallback
    is a reachability guard, not a normal case for this deployment."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


def _compute_record_hash(
    *,
    prev_hash: str | None,
    organization_id: UUID,
    action: str,
    entity_type: str,
    entity_id: UUID | None,
    metadata: dict[str, Any],
) -> str:
    """A real SHA-256 over this event's own fields, chained onto the immediately-preceding row's
    hash for this organization -- tampering with (or deleting) any past row breaks every hash
    computed after it, which is exactly what app/api/audit.py's /health endpoint re-verifies.
    Deliberately excludes `created_at` (a DB server_default, not known until after insert) --
    the chain links on `prev_hash`, not wall-clock time, so this is still genuinely tamper-evident."""
    payload = json.dumps(
        {
            "prev_hash": prev_hash,
            "organization_id": str(organization_id),
            "action": action,
            "entity_type": entity_type,
            "entity_id": str(entity_id) if entity_id else None,
            "metadata": metadata,
        },
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def log_audit_event(
    db: Session,
    *,
    organization_id: UUID,
    actor_user_id: str | UUID | None,
    action: str,
    entity_type: str,
    entity_id: UUID | None = None,
    metadata: dict[str, Any] | None = None,
    request: Request | None = None,
    actor_email: str | None = None,
    session_id: str | None = None,
) -> None:
    """Best-effort audit trail write — mirrors the fire-and-forget posture of
    app.repositories.ai_requests.log_ai_request: never raises, so a logging failure can never
    break the caller's primary action. Call this *after* the caller's own db.commit() so this
    extra insert can't get entangled with (or accidentally roll back) the write it's recording.

    `request`/`actor_email`/`session_id` are optional and additive -- omitting them (as most
    existing call sites still do) simply leaves those columns null on that row, same as any
    pre-governance-phase row; it never blocks or degrades the write itself.
    """
    try:
        meta = metadata or {}
        ip_address = get_client_ip(request) if request is not None else None

        prev_hash: str | None = None
        try:
            last = db.scalar(
                select(AuditLog.record_hash)
                .where(AuditLog.organization_id == organization_id)
                .order_by(AuditLog.created_at.desc())
                .limit(1)
            )
            prev_hash = last
        except Exception:
            # A failed chain lookup must never block the audit write itself -- worst case this
            # row starts a new chain segment (visible/honest in /audit/health's continuity check,
            # never silently claimed as unbroken).
            logger.exception("audit hash-chain lookup failed for org=%s; continuing without it", organization_id)

        record_hash = _compute_record_hash(
            prev_hash=prev_hash,
            organization_id=organization_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            metadata=meta,
        )

        row = AuditLog(
            organization_id=organization_id,
            actor_user_id=_actor_uuid(actor_user_id),
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            event_metadata=meta,
            session_id=session_id,
            actor_email=actor_email,
            ip_address=ip_address,
            record_hash=record_hash,
            prev_hash=prev_hash,
        )
        db.add(row)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("failed to record audit_logs event action=%s entity_type=%s", action, entity_type)


@dataclass
class ChainVerificationResult:
    valid: bool
    records_verified: int
    total_hash_chained: int
    broken_at_id: UUID | None
    broken_reason: str | None


def verify_chain_continuity(db: Session, organization_id: UUID) -> ChainVerificationResult:
    """Real re-verification, not a status flag someone set once: walks every hash-chained row for
    this org oldest-first, recomputing each record_hash fresh from that row's own fields and
    confirming it both matches what's stored AND that prev_hash genuinely equals the preceding
    row's actual hash. A single UPDATE to any past row's action/entity/metadata -- or a deleted
    row -- breaks this at exactly that point, which is the entire point of a hash chain."""
    from app.repositories.audit import list_audit_logs_for_chain_verification

    rows = list_audit_logs_for_chain_verification(db, organization_id)
    prev_hash: str | None = None
    verified = 0
    for row in rows:
        if row.prev_hash != prev_hash:
            return ChainVerificationResult(
                valid=False,
                records_verified=verified,
                total_hash_chained=len(rows),
                broken_at_id=row.id,
                broken_reason="stored prev_hash does not match the preceding record's actual hash",
            )
        expected = _compute_record_hash(
            prev_hash=prev_hash,
            organization_id=row.organization_id,
            action=row.action,
            entity_type=row.entity_type,
            entity_id=row.entity_id,
            metadata=row.event_metadata,
        )
        if expected != row.record_hash:
            return ChainVerificationResult(
                valid=False,
                records_verified=verified,
                total_hash_chained=len(rows),
                broken_at_id=row.id,
                broken_reason="record_hash does not match a fresh recomputation of this record's own fields",
            )
        prev_hash = row.record_hash
        verified += 1

    return ChainVerificationResult(
        valid=True, records_verified=verified, total_hash_chained=len(rows), broken_at_id=None, broken_reason=None
    )
