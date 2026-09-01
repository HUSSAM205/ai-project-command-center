import uuid

from sqlalchemy import ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import CreatedAtMixin, UUIDPKMixin


class Permission(UUIDPKMixin, CreatedAtMixin, Base):
    """A single grantable capability, e.g. "admin.access" or "task.write". Small, static
    catalog — seeded by the Phase 5 migration, not created through the API."""

    __tablename__ = "permissions"

    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)


class RolePermission(UUIDPKMixin, CreatedAtMixin, Base):
    """Grants a `Permission` to a role. `role` stores the same string values as the existing
    `users.role` enum (ADMIN/MANAGER/MEMBER/VIEWER) rather than a foreign key into a `roles`
    table — Phase 5 keeps `users.role` as the source of truth for "which role is this user"
    (a full role-entity refactor of `users` is out of scope for this pass) and layers a real,
    queryable many-to-many permission grant on top of it. This is what
    `app.core.deps.require_permission` checks against, so permissions are enforced from data,
    not a hardcoded if/else — see app/core/deps.py and the Phase 5 migration's seed data."""

    __tablename__ = "role_permissions"
    __table_args__ = (UniqueConstraint("role", "permission_id", name="uq_role_permission"),)

    role: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    permission_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False
    )

    permission: Mapped["Permission"] = relationship()
