import uuid

from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import CreatedAtMixin, UUIDPKMixin
from app.models.enums import UserRole


class User(UUIDPKMixin, CreatedAtMixin, Base):
    __tablename__ = "users"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Globally unique, not per-organization: login has no way to disambiguate which org a
    # caller means (there's no org-selection step), and this product's signup flow always
    # creates a brand-new organization per registration — so email is the caller's real
    # identity across the whole system, not scoped to one org. A per-org unique constraint
    # here previously let the same email register in two orgs, and login's
    # `select(User).where(User.email == ...)` (no org filter, since it can't have one) would
    # silently resolve to whichever row Postgres returned first, spuriously rejecting the
    # other account's correct password. See backend/tests/api/test_auth.py::TestLogin.
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role", native_enum=True), nullable=False, default=UserRole.MEMBER
    )

    organization: Mapped["Organization"] = relationship(back_populates="users")  # noqa: F821
