import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import UUIDPKMixin


class AuditLog(UUIDPKMixin, Base):
    """One row per audited event (see app/services/audit.py's `log_audit_event`). Populated
    additively from existing write endpoints — login, project create/update, task assignment,
    risk creation, budget changes, document upload, AI requests, admin actions — never
    restructuring the routers that call it."""

    __tablename__ = "audit_logs"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Nullable: some events have no real user behind them (e.g. an anonymous demo session).
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    # Mapped to the DB column literally named "metadata" (per spec) — the Python attribute is
    # named `event_metadata` because `metadata` is reserved on every SQLAlchemy declarative
    # model (it's `Base.metadata`, the table registry). This IS the "changes_payload" concept --
    # deliberately not a second, parallel JSONB column.
    event_metadata: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    # Governance/compliance additions -- all nullable since every pre-existing row (and any
    # caller that hasn't been retrofitted with request/email yet -- see log_audit_event) predates
    # or simply doesn't have these. None is an honest "not captured for this event", never a
    # fabricated placeholder value.
    session_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    actor_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Tamper-evident hash chain (app/services/audit.py::log_audit_event): record_hash is a real
    # SHA-256 over this row's own fields chained onto the immediately-preceding row's record_hash
    # (prev_hash) for this organization. Both null on any row written before this feature shipped
    # -- see app/api/audit.py's /health endpoint for how continuity is actually verified, and why
    # pre-existing null-hash rows are honestly excluded from that check rather than counted as
    # "verified".
    record_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    prev_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
