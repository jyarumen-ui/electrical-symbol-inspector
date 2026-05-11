import uuid
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel


class AiCandidate(BaseModel):
    symbolCode: str
    label: str
    confidence: float


class SymbolHitCreate(BaseModel):
    job_id: uuid.UUID
    revision_id: uuid.UUID | None = None
    symbol_code: str
    label: str | None = None
    ai_confidence: float | None = None
    ai_candidates: list[AiCandidate] | None = None
    x: float | None = None
    y: float | None = None
    width: float | None = None
    height: float | None = None
    status: str = "UNASSIGNED"
    note: str | None = None


class SymbolHitRead(BaseModel):
    id: uuid.UUID
    job_id: uuid.UUID
    revision_id: uuid.UUID | None
    symbol_code: str
    label: str | None
    ai_confidence: float | None
    ai_candidates: list[AiCandidate] | None
    x: float | None
    y: float | None
    width: float | None
    height: float | None
    status: str
    note: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SymbolHitUpdate(BaseModel):
    symbol_code: str | None = None
    status: str | None = None
    note: str | None = None
