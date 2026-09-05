import csv
import io
import json
from datetime import date

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import CurrentPrincipal, require_permission
from app.repositories.audit import count_audit_logs_total, iter_audit_logs_for_export, list_audit_logs
from app.schemas.admin import AuditLogOut, AuditLogPage
from app.schemas.audit import AuditHealthOut
from app.services.audit import log_audit_event, verify_chain_continuity

router = APIRouter(prefix="/api/v1/audit", tags=["audit"])

# Governance/compliance data — gated the same as the existing /admin/audit-logs viewer, not opened
# any wider. This is a second, richer read surface over the SAME audit_logs table (date-range
# filtering, CSV export, chain-health), not a competing audit pipeline.
require_admin = require_permission("admin.access")


@router.get("/logs", response_model=AuditLogPage)
def get_audit_logs(
    resource_type: str | None = None,
    action: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=200),
    principal: CurrentPrincipal = Depends(require_admin),
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
    return AuditLogPage(
        items=[AuditLogOut.model_validate(r) for r in rows], total=total, page=page, page_size=page_size
    )


@router.get("/export")
def export_audit_logs(
    resource_type: str | None = None,
    action: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    principal: CurrentPrincipal = Depends(require_admin),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """Streams the org's real, filtered audit trail as CSV -- every row is an actual audit_logs
    record (capped at EXPORT_ROW_LIMIT, most recent first), never a synthesized/sample export.
    The export action is itself audited below (action="audit.export"), so the compliance trail
    records who pulled a compliance trail and when."""
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
            row.actor_email or "",
            row.session_id or "",
            row.ip_address or "",
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
    principal: CurrentPrincipal = Depends(require_admin),
    db: Session = Depends(get_db),
) -> AuditHealthOut:
    """Real, freshly-computed governance metrics -- never a hardcoded "all green" status. See
    module docstring on AuditHealthOut and app/services/audit.py::verify_chain_continuity."""
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
