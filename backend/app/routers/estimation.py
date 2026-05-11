from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import EstimationItem, Job
from ..schemas import EstimationItemRead, EstimationItemUpdate, EstimationSummary, GenerateEstimationResponse
from ..services.estimation_service import generate_estimation, get_estimation_summary
from ..services.export_service import build_excel, build_pdf

router = APIRouter(tags=["estimation"])


@router.post("/jobs/{job_id}/estimation/generate", response_model=GenerateEstimationResponse, status_code=201)
async def generate(job_id: UUID, db: AsyncSession = Depends(get_db)):
    try:
        return await generate_estimation(job_id, db)
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.get("/jobs/{job_id}/estimation/summary", response_model=EstimationSummary)
async def summary(job_id: UUID, db: AsyncSession = Depends(get_db)):
    return await get_estimation_summary(job_id, db)


@router.patch("/estimation-items/{item_id}", response_model=EstimationItemRead)
async def update_item(item_id: UUID, body: EstimationItemUpdate, db: AsyncSession = Depends(get_db)):
    item = await db.get(EstimationItem, item_id)
    if not item:
        raise HTTPException(404, "EstimationItem not found")

    updates = body.model_dump(exclude_none=True)
    for k, v in updates.items():
        setattr(item, k, v)

    # Recalculate amount if quantity or unit_price changed
    if "quantity" in updates or "unit_price" in updates:
        item.amount = item.quantity * item.unit_price

    await db.commit()
    await db.refresh(item)
    return item


@router.get("/jobs/{job_id}/estimation/export/excel")
async def export_excel(job_id: UUID, db: AsyncSession = Depends(get_db)):
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    s = await get_estimation_summary(job_id, db)
    data = build_excel(s, job.company_name or "（会社名未設定）", job.site_name or "（現場名未設定）")
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="estimation_{job_id}.xlsx"'},
    )


@router.get("/jobs/{job_id}/estimation/export/pdf")
async def export_pdf(job_id: UUID, db: AsyncSession = Depends(get_db)):
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    s = await get_estimation_summary(job_id, db)
    data = build_pdf(s, job.company_name or "（会社名未設定）", job.site_name or "（現場名未設定）")
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="estimation_{job_id}.pdf"'},
    )
