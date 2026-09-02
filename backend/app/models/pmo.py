"""Advanced PMO engines domain: RACI matrix, stage gates, and the contract ledger.

A separate, additive domain from the core PM tables in app/models/project.py etc. — same
org-scoping discipline (every table here is scoped via its parent project's organization_id,
joined on every query, same pattern as app/models/risk.py / app/repositories/risks.py).

EVM (PV/EV/AC/CPI/SPI/EAC/VAC) and the boardroom memo have NO tables here — they are computed
on every read by app/services/evm.py and app/services/boardroom_memo.py respectively, the same
"never persist a derived value" discipline used throughout this app (see docs/DATABASE_SCHEMA.md
"A note on derived values"). RACI/stage gates/contract ledger ARE real persisted tables because
they hold genuine user-entered/assigned data, not derived numbers — only ContractLedger's
`margin_leakage_pct` is derived (by app/services/contract_ledger.py) and therefore not a column.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPKMixin
from app.models.enums import StageGateNumber, StageGateStatus


class RaciEntry(UUIDPKMixin, TimestampMixin, Base):
    """One row per task/deliverable in a project's RACI matrix.

    Each of the four RACI roles references a single `resources` row (not `users`) — chosen for
    consistency with the existing app.models.task.Task.assignee_id convention, where a
    resource (not a user account) is who work is actually assigned to. A real-world RACI often
    has multiple Consulted/Informed parties per deliverable; this schema models one of each per
    row by design (matching the literal column list in the spec) — represent additional
    consulted/informed parties with a second row for the same `task_or_deliverable` with only
    that field populated, rather than adding array columns.
    """

    __tablename__ = "raci_entries"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    task_or_deliverable: Mapped[str] = mapped_column(String(255), nullable=False)
    responsible_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("resources.id", ondelete="SET NULL"), nullable=True
    )
    accountable_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("resources.id", ondelete="SET NULL"), nullable=True
    )
    consulted_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("resources.id", ondelete="SET NULL"), nullable=True
    )
    informed_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("resources.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    project: Mapped["Project"] = relationship()  # noqa: F821
    responsible: Mapped["Resource | None"] = relationship(foreign_keys=[responsible_id], viewonly=True)  # noqa: F821
    accountable: Mapped["Resource | None"] = relationship(foreign_keys=[accountable_id], viewonly=True)  # noqa: F821
    consulted: Mapped["Resource | None"] = relationship(foreign_keys=[consulted_id], viewonly=True)  # noqa: F821
    informed: Mapped["Resource | None"] = relationship(foreign_keys=[informed_id], viewonly=True)  # noqa: F821


class StageGate(UUIDPKMixin, TimestampMixin, Base):
    """One steering-committee gate (G1..G5) for a project. Sign-off is a write action
    (require_write_access, app/api/pmo.py) — setting status to APPROVED stamps `signed_off_at`
    server-side if not already set, so a sign-off timestamp is never client-forgeable."""

    __tablename__ = "stage_gates"
    __table_args__ = (UniqueConstraint("project_id", "gate", name="uq_stage_gates_project_gate"),)

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    gate: Mapped[StageGateNumber] = mapped_column(
        Enum(StageGateNumber, name="stage_gate_number", native_enum=True), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[StageGateStatus] = mapped_column(
        Enum(StageGateStatus, name="stage_gate_status", native_enum=True),
        nullable=False,
        default=StageGateStatus.PENDING,
    )
    # Free-text approver name — same convention as Risk.owner (app/models/risk.py), not a
    # users/resources FK, since a steering-committee approver is often outside the project team.
    approver: Mapped[str | None] = mapped_column(String(255), nullable=True)
    signed_off_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    project: Mapped["Project"] = relationship()  # noqa: F821


class ContractLedger(UUIDPKMixin, TimestampMixin, Base):
    """One row per project (like app.models.budget.Budget) tracking commercial contract
    position. `margin_leakage_pct` is intentionally NOT a column — derived on every read by
    app/services/contract_ledger.py from this row + Project.budget/actual_cost/progress, same
    "never persist a derived value" rule as everywhere else in this app."""

    __tablename__ = "contract_ledger"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    total_contract_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    billed_to_date: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    wip: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    currency: Mapped[str] = mapped_column(String(8), nullable=False, default="USD")

    project: Mapped["Project"] = relationship()  # noqa: F821
