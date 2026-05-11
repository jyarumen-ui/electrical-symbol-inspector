import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import String, Text, Numeric, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class EstimationItem(Base):
    __tablename__ = "estimation_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("jobs.id"), nullable=False, index=True)
    symbol_hit_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("symbol_hits.id"), nullable=False)
    master_item_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("master_items.id"))
    symbol_code: Mapped[str] = mapped_column(String(100), nullable=False)
    item_name: Mapped[str] = mapped_column(String(255), nullable=False)
    maker: Mapped[str | None] = mapped_column(String(255))
    model_number: Mapped[str | None] = mapped_column(String(255))
    quantity: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    unit: Mapped[str] = mapped_column(String(50), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    misc_rate: Mapped[Decimal] = mapped_column(Numeric(5, 4), default=Decimal("0.15"))
    tax_rate: Mapped[Decimal] = mapped_column(Numeric(5, 4), default=Decimal("0.10"))
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="CONFIRMED")
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    job: Mapped["Job"] = relationship("Job", back_populates="estimation_items")
    symbol_hit: Mapped["SymbolHit"] = relationship("SymbolHit", back_populates="estimation_item")
    master_item: Mapped["MasterItem | None"] = relationship("MasterItem", back_populates="estimation_items")
