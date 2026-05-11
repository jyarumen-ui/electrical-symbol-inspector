import uuid
from datetime import datetime, date
from decimal import Decimal
from pydantic import BaseModel


class MasterItemCreate(BaseModel):
    symbol_code: str
    item_name: str
    maker: str | None = None
    model_number: str | None = None
    grade: str | None = None
    unit: str
    material_cost: Decimal
    labor_cost: Decimal
    region_code: str = "DEFAULT"
    valid_from: date
    valid_until: date | None = None


class MasterItemUpdate(BaseModel):
    item_name: str | None = None
    maker: str | None = None
    model_number: str | None = None
    grade: str | None = None
    unit: str | None = None
    material_cost: Decimal | None = None
    labor_cost: Decimal | None = None
    region_code: str | None = None
    valid_from: date | None = None
    valid_until: date | None = None


class MasterItemRead(BaseModel):
    id: uuid.UUID
    symbol_code: str
    item_name: str
    maker: str | None
    model_number: str | None
    grade: str | None
    unit: str
    material_cost: Decimal
    labor_cost: Decimal
    region_code: str
    valid_from: date
    valid_until: date | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MasterItemHistoryRead(BaseModel):
    id: uuid.UUID
    master_item_id: uuid.UUID
    changed_at: datetime
    changed_by: str | None
    old_values: dict

    model_config = {"from_attributes": True}
