import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Date, DateTime, ForeignKey, Index, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ce_api.db.base import Base


class CourseCredit(Base):
    __tablename__ = "course_credits"
    __table_args__ = (
        Index(None, "user_id", "completed_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    provider: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    completed_at: Mapped[date] = mapped_column(Date, nullable=False)
    hours: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
