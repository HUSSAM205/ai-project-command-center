import uuid

from sqlalchemy import ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import CreatedAtMixin, UUIDPKMixin


class Feedback(UUIDPKMixin, CreatedAtMixin, Base):
    """Free-text feedback, submittable by any authenticated user including anonymous demo
    sessions (see POST /api/v1/feedback in app/api/feedback.py). Deliberately simple — no
    status/category workflow, per Phase 5 scope."""

    __tablename__ = "feedback"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
