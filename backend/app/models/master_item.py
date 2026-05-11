import uuid
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import String, Text, Numeric, DateTime, Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class MasterItem(Base):
    __tablename__ = "master_items"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    symbol_code: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    item_name: Mapped[str] = mapped_column(String(255), nullable=False)
    maker: Mapped[str | None] = mapped_column(String(255))
    model_number: Mapped[str | None] = mapped_column(String(255))
    grade: Mapped[str | None] = mapped_column(String(100))
    unit: Mapped[str] = mapped_column(String(50), nullable=False)
    material_cost: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    labor_cost: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    region_code: Mapped[str] = mapped_column(String(50), default="DEFAULT")
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_until: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    history: Mapped[list["MasterItemHistory"]] = relationship("MasterItemHistory", back_populates="master_item", cascade="all, delete-orphan")
    estimation_items: Mapped[list["EstimationItem"]] = relationship("EstimationItem", back_populates="master_item")


class MasterItemHistory(Base):
    __tablename__ = "master_item_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    master_item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("master_items.id"), nullable=False)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    changed_by: Mapped[str | None] = mapped_column(String(255))
    old_values: Mapped[dict] = mapped_column(JSONB, nullable=False)

    master_item: Mapped["MasterItem"] = relationship("MasterItem", back_populates="history")
