import uuid
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel


class EstimationItemRead(BaseModel):
    id: uuid.UUID
    job_id: uuid.UUID
    symbol_hit_id: uuid.UUID
    master_item_id: uuid.UUID | None
    symbol_code: str
    item_name: str
    maker: str | None
    model_number: str | None
    quantity: Decimal
    unit: str
    unit_price: Decimal
    amount: Decimal
    misc_rate: Decimal
    tax_rate: Decimal
    status: str
    note: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class EstimationItemUpdate(BaseModel):
    quantity: Decimal | None = None
    unit_price: Decimal | None = None
    misc_rate: Decimal | None = None
    tax_rate: Decimal | None = None
    status: str | None = None
    note: str | None = None


class EstimationSummaryItem(BaseModel):
    symbol_code: str
    item_name: str
    status: str
    count: int
    subtotal: Decimal
    misc_fee: Decimal
    tax: Decimal
    total: Decimal


class EstimationSummary(BaseModel):
    job_id: uuid.UUID
    confirmed_items: list[EstimationItemRead]
    pending_items: list[EstimationItemRead]
    excluded_count: int
    subtotal: Decimal
    misc_fee: Decimal
    tax: Decimal
    grand_total: Decimal


class GenerateEstimationResponse(BaseModel):
    generated: int
    skipped: int
    items: list[EstimationItemRead]
