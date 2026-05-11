import uuid
from datetime import datetime
from sqlalchemy import String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    site_name: Mapped[str | None] = mapped_column(String(255))
    company_name: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(50), default="ACTIVE")
    region_code: Mapped[str] = mapped_column(String(50), default="DEFAULT")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    symbol_hits: Mapped[list["SymbolHit"]] = relationship("SymbolHit", back_populates="job", cascade="all, delete-orphan")
    estimation_items: Mapped[list["EstimationItem"]] = relationship("EstimationItem", back_populates="job", cascade="all, delete-orphan")
    revisions: Mapped[list["JobRevision"]] = relationship("JobRevision", back_populates="job", cascade="all, delete-orphan")


class JobRevision(Base):
    __tablename__ = "job_revisions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("jobs.id"), nullable=False)
    rev_number: Mapped[str] = mapped_column(String(50), nullable=False)
    pdf_url: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    job: Mapped["Job"] = relationship("Job", back_populates="revisions")
    symbol_hits: Mapped[list["SymbolHit"]] = relationship("SymbolHit", back_populates="revision")
