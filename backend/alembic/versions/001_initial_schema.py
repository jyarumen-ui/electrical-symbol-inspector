"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-05-08
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "jobs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("site_name", sa.String(255)),
        sa.Column("company_name", sa.String(255)),
        sa.Column("status", sa.String(50), nullable=False, server_default="ACTIVE"),
        sa.Column("region_code", sa.String(50), nullable=False, server_default="DEFAULT"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "job_revisions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("job_id", UUID(as_uuid=True), sa.ForeignKey("jobs.id"), nullable=False),
        sa.Column("rev_number", sa.String(50), nullable=False),
        sa.Column("pdf_url", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "symbol_hits",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("job_id", UUID(as_uuid=True), sa.ForeignKey("jobs.id"), nullable=False),
        sa.Column("revision_id", UUID(as_uuid=True), sa.ForeignKey("job_revisions.id")),
        sa.Column("symbol_code", sa.String(100), nullable=False),
        sa.Column("label", sa.String(255)),
        sa.Column("ai_confidence", sa.Numeric(5, 4)),
        sa.Column("ai_candidates", JSONB),
        sa.Column("x", sa.Numeric(10, 4)),
        sa.Column("y", sa.Numeric(10, 4)),
        sa.Column("width", sa.Numeric(10, 4)),
        sa.Column("height", sa.Numeric(10, 4)),
        sa.Column("status", sa.String(50), nullable=False, server_default="UNASSIGNED"),
        sa.Column("note", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_symbol_hits_job_id", "symbol_hits", ["job_id"])

    op.create_table(
        "master_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("symbol_code", sa.String(100), nullable=False),
        sa.Column("item_name", sa.String(255), nullable=False),
        sa.Column("maker", sa.String(255)),
        sa.Column("model_number", sa.String(255)),
        sa.Column("grade", sa.String(100)),
        sa.Column("unit", sa.String(50), nullable=False),
        sa.Column("material_cost", sa.Numeric(10, 2), nullable=False),
        sa.Column("labor_cost", sa.Numeric(10, 2), nullable=False),
        sa.Column("region_code", sa.String(50), nullable=False, server_default="DEFAULT"),
        sa.Column("valid_from", sa.Date, nullable=False),
        sa.Column("valid_until", sa.Date),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_master_items_symbol_code", "master_items", ["symbol_code"])

    op.create_table(
        "master_item_history",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("master_item_id", UUID(as_uuid=True), sa.ForeignKey("master_items.id"), nullable=False),
        sa.Column("changed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("changed_by", sa.String(255)),
        sa.Column("old_values", JSONB, nullable=False),
    )

    op.create_table(
        "estimation_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("job_id", UUID(as_uuid=True), sa.ForeignKey("jobs.id"), nullable=False),
        sa.Column("symbol_hit_id", UUID(as_uuid=True), sa.ForeignKey("symbol_hits.id"), nullable=False),
        sa.Column("master_item_id", UUID(as_uuid=True), sa.ForeignKey("master_items.id")),
        sa.Column("symbol_code", sa.String(100), nullable=False),
        sa.Column("item_name", sa.String(255), nullable=False),
        sa.Column("maker", sa.String(255)),
        sa.Column("model_number", sa.String(255)),
        sa.Column("quantity", sa.Numeric(10, 3), nullable=False),
        sa.Column("unit", sa.String(50), nullable=False),
        sa.Column("unit_price", sa.Numeric(10, 2), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("misc_rate", sa.Numeric(5, 4), nullable=False, server_default="0.15"),
        sa.Column("tax_rate", sa.Numeric(5, 4), nullable=False, server_default="0.10"),
        sa.Column("status", sa.String(50), nullable=False, server_default="CONFIRMED"),
        sa.Column("note", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_estimation_items_job_id", "estimation_items", ["job_id"])


def downgrade() -> None:
    op.drop_table("estimation_items")
    op.drop_table("master_item_history")
    op.drop_table("master_items")
    op.drop_table("symbol_hits")
    op.drop_table("job_revisions")
    op.drop_table("jobs")
