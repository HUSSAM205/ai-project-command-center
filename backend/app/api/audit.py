import csv
import io
import json
import time
from datetime import date

import redis as redis_lib
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import CurrentPrincipal, get_current_principal, has_permission
from app.core.redis import get_redis_client
from app.repositories.audit import count_audit_logs_total, iter_audit_logs_for_export, list_audit_logs
from app.schemas.admin import AuditLogOut, AuditLogPage
from app.schemas.audit import AuditHealthOut
from app.services.audit import log_audit_event, verify_chain_continuity

router = APIRouter(prefix="/api/v1/audit", tags=["audit"])

# Public Evaluation Mode: this whole router is readable by any authenticated caller, including an
# anonymous demo/read-only session (get_current_principal, not require_permission("admin.access"))
# -- a LinkedIn/portfolio visitor should be able to see the real Compliance HUD, audit trail, and
# hash chain without registering an account, same spirit as every other read surface in this app's
# public demo mode. What's NOT public: two real, directly-identifying fields this table carries --
# actor_email and ip_address of whoever actually performed each action, which can belong to a real
# registered account (this app's /register is public), not just seeded demo data. Those two fields
# are redacted to null for any caller who doesn't hold the real admin.access permission; every
# other field (action, resource type, timestamp, the hash-chain columns themselves) is real and
# unredacted for everyone. There is still no mutation anywhere on this router -- every route below
# is a GET, and every actual write endpoint elsewhere in the app keeps its existing
# require_write_access gate untouched.
EXPORT_RATE_LIMIT_PER_HOUR = 20


def _is_privileged(db: Session, principal: CurrentPrincipal) -> bool:
    return has_permission(db, principal.role, "admin.access")


def _redact_row(item: AuditLogOut, privileged: bool) -> AuditLogOut:
    if privileged:
        return item
    return item.model_copy(update={"actor_email": None, "ip_address": None})


def _enforce_export_rate_limit(principal: CurrentPrincipal) -> None:
    """Only for callers who aren't already gated by a real login -- a public, unauthenticated-in-
    spirit endpoint doing real DB + CSV work needs some bound against repeated automated pulls.
    Fails open if Redis is unreachable, same posture as AIRouter's own rate limiter."""
    if not principal.read_only:
        return
    try:
        redis_client = get_redis_client()
        window = time.strftime("%Y%m%d%H", time.gmtime())
        scope_key = principal.session_id or principal.user_id
        key = f"audit:export:ratelimit:{principal.organization_id}:{scope_key}:{window}"
        count = redis_client.incr(key)
        if count == 1:
            redis_client.expire(key, 3600)
    except redis_lib.RedisError:
        return
    if count > EXPORT_RATE_LIMIT_PER_HOUR:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Audit export rate limit exceeded ({EXPORT_RATE_LIMIT_PER_HOUR}/hour) for public sessions.",
        )


@router.get("/logs", response_model=AuditLogPage)
def get_audit_logs(
    resource_type: str | None = None,
    action: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> AuditLogPage:
    rows, total = list_audit_logs(
        db,
        principal.organization_id,
        action=action,
        entity_type=resource_type,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
    )
    privileged = _is_privileged(db, principal)
    items = [_redact_row(AuditLogOut.model_validate(r), privileged) for r in rows]
    return AuditLogPage(items=items, total=total, page=page, page_size=page_size)


@router.get("/export")
def export_audit_logs(
    resource_type: str | None = None,
    action: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """Streams the org's real, filtered audit trail as CSV -- every row is an actual audit_logs
    record (capped at EXPORT_ROW_LIMIT, most recent first), never a synthesized/sample export.
    The export action is itself audited below (action="audit.export"), so the compliance trail
    records who pulled a compliance trail and when. actor_email/ip_address are blanked out below
    for non-admin callers -- see this module's top-of-file note."""
    _enforce_export_rate_limit(principal)
    privileged = _is_privileged(db, principal)

    rows = iter_audit_logs_for_export(
        db, principal.organization_id, action=action, entity_type=resource_type, date_from=date_from, date_to=date_to
    )

    # Materialized into plain tuples up front, not read lazily from the ORM rows inside the
    # generator below: log_audit_event's own db.commit() (for the "audit.export" event, right
    # after this) expires every ORM instance tied to `db`, including everything in `rows` --
    # StreamingResponse iterates its generator after this route function has already returned, by
    # which point the request-scoped `db` session may already be torn down. Touching `row.<attr>`
    # at that point silently truncated the stream to just the header row (caught in live
    # verification, not hypothetically) rather than raising a visible error.
    csv_rows = [
        (
            str(row.id),
            row.created_at.isoformat(),
            row.action,
            row.entity_type,
            str(row.entity_id) if row.entity_id else "",
            str(row.actor_user_id) if row.actor_user_id else "",
            (row.actor_email or "") if privileged else "",
            row.session_id or "",
            (row.ip_address or "") if privileged else "",
            json.dumps(row.event_metadata, sort_keys=True),
            row.record_hash or "",
            row.prev_hash or "",
        )
        for row in rows
    ]

    def generate():
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(
            [
                "id", "timestamp", "action", "resource_type", "resource_id", "actor_user_id", "actor_email",
                "session_id", "ip_address", "changes_payload", "record_hash", "prev_hash",
            ]
        )
        yield buf.getvalue()
        for values in csv_rows:
            buf.seek(0)
            buf.truncate(0)
            writer.writerow(values)
            yield buf.getvalue()

    log_audit_event(
        db,
        organization_id=principal.organization_id,
        actor_user_id=principal.user_id,
        action="audit.export",
        entity_type="audit_log",
        actor_email=principal.email,
    )

    filename = f"audit-trail-{date.today().isoformat()}.csv"
    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/health", response_model=AuditHealthOut)
def get_audit_health(
    principal: CurrentPrincipal = Depends(get_current_principal),
    db: Session = Depends(get_db),
) -> AuditHealthOut:
    """Real, freshly-computed governance metrics -- never a hardcoded "all green" status. See
    module docstring on AuditHealthOut and app/services/audit.py::verify_chain_continuity. No
    PII anywhere in this response (aggregate counts and statuses only), so it's fully public with
    no redaction needed."""
    chain = verify_chain_continuity(db, principal.organization_id)
    total_records = count_audit_logs_total(db, principal.organization_id)

    ssl_enforced = "sslmode=require" in settings.DATABASE_URL

    if chain.total_hash_chained == 0:
        chain_status = "No hash-chained records yet"
    elif chain.valid:
        chain_status = "Active"
    else:
        chain_status = "Broken"

    return AuditHealthOut(
        tenant_isolation_status="Enforced",
        tenant_isolation_detail=(
            "Every audit query is scoped by organization_id derived from the caller's "
            "authenticated JWT, never client-supplied input; audit_logs.organization_id is a "
            "foreign key to organizations.id with ON DELETE CASCADE."
        ),
        transport_encryption_status="TLS enforced" if ssl_enforced else "Not verified",
        transport_encryption_detail=(
            "Database connection string requires sslmode=require."
            if ssl_enforced
            else "Could not confirm sslmode=require on the configured DATABASE_URL."
        ),
        storage_encryption_status="Provider-managed",
        storage_encryption_detail="Encryption at rest is provided by Neon (the managed Postgres host), not independently verifiable from application code.",
        chain_status=chain_status,
        chain_records_verified=chain.records_verified,
        chain_total_hash_chained=chain.total_hash_chained,
        chain_broken_at_id=chain.broken_at_id,
        chain_broken_reason=chain.broken_reason,
        total_audit_records=total_records,
    )
