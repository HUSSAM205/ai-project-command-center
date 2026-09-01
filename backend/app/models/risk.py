import uuid

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import UUIDPKMixin
from app.models.enums import RiskCategory, RiskStatus


class Risk(UUIDPKMixin, Base):
    __tablename__ = "risks"
    __table_args__ = (
        CheckConstraint("probability BETWEEN 1 AND 5", name="ck_risks_probability_range"),
        CheckConstraint("impact BETWEEN 1 AND 5", name="ck_risks_impact_range"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[RiskCategory] = mapped_column(
        Enum(RiskCategory, name="risk_category", native_enum=True), nullable=False
    )
    probability: Mapped[int] = mapped_column(Integer, nullable=False)
    impact: Mapped[int] = mapped_column(Integer, nullable=False)

    # score and severity are intentionally NOT persisted — computed on read
    # (score = probability * impact; severity derived from score per PRODUCT_REQUIREMENTS.md).

    owner: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mitigation: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[RiskStatus] = mapped_column(
        Enum(RiskStatus, name="risk_status", native_enum=True), nullable=False, default=RiskStatus.OPEN
    )

    project: Mapped["Project"] = relationship(back_populates="risks")  # noqa: F821
