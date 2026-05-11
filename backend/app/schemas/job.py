import uuid
from datetime import datetime
from pydantic import BaseModel


class JobCreate(BaseModel):
    name: str
    site_name: str | None = None
    company_name: str | None = None
    region_code: str = "DEFAULT"


class JobRead(BaseModel):
    id: uuid.UUID
    name: str
    site_name: str | None
    company_name: str | None
    status: str
    region_code: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class JobRevisionCreate(BaseModel):
    rev_number: str
    pdf_url: str


class JobRevisionRead(BaseModel):
    id: uuid.UUID
    job_id: uuid.UUID
    rev_number: str
    pdf_url: str
    created_at: datetime

    model_config = {"from_attributes": True}
