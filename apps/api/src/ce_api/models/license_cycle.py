import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Numeric, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ce_api.db.base import Base


class LicenseCycle(Base):
    __tablename__ = "license_cycles"
    __table_args__ = (
        Index(None, "state_license_id"),
        Index(None, "cycle_end"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    state_license_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("state_licenses.id"), nullable=False
    )
    cycle_start: Mapped[date] = mapped_column(Date, nullable=False)
    cycle_end: Mapped[date] = mapped_column(Date, nullable=False)
    required_hours: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
