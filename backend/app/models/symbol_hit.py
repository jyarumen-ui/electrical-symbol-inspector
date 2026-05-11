import uuid
from datetime import datetime
from sqlalchemy import String, Text, Numeric, DateTime, ForeignKey, JSON
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class SymbolHit(Base):
    __tablename__ = "symbol_hits"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("jobs.id"), nullable=False)
    revision_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("job_revisions.id"))
    symbol_code: Mapped[str] = mapped_column(String(100), nullable=False)
    label: Mapped[str | None] = mapped_column(String(255))
    ai_confidence: Mapped[float | None] = mapped_column(Numeric(5, 4))
    ai_candidates: Mapped[list | None] = mapped_column(JSONB)
    # Bounding box (normalized 0-1 or mm coordinates)
    x: Mapped[float | None] = mapped_column(Numeric(10, 4))
    y: Mapped[float | None] = mapped_column(Numeric(10, 4))
    width: Mapped[float | None] = mapped_column(Numeric(10, 4))
    height: Mapped[float | None] = mapped_column(Numeric(10, 4))
    status: Mapped[str] = mapped_column(String(50), default="UNASSIGNED")
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    job: Mapped["Job"] = relationship("Job", back_populates="symbol_hits")
    revision: Mapped["JobRevision | None"] = relationship("JobRevision", back_populates="symbol_hits")
    estimation_item: Mapped["EstimationItem | None"] = relationship("EstimationItem", back_populates="symbol_hit", uselist=False)
