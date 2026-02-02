import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ce_api.db.base import Base


class Certificate(Base):
    __tablename__ = "certificates"
    __table_args__ = (
        Index(None, "course_credit_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_credit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("course_credits.id"), nullable=False
    )
    filename: Mapped[str] = mapped_column(String, nullable=False)
    content_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    size_bytes: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    blob_path: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
