import logging
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import SymbolHit
from ..schemas import SymbolHitCreate, SymbolHitRead, SymbolHitUpdate
from ..services.estimation_service import generate_estimation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/symbol-hits", tags=["symbol-hits"])

_REVIEW_TERMINAL = {"ACCEPTED", "REJECTED"}


@router.post("", response_model=SymbolHitRead, status_code=201)
async def create_symbol_hit(body: SymbolHitCreate, db: AsyncSession = Depends(get_db)):
    hit = SymbolHit(**body.model_dump())
    db.add(hit)
    await db.commit()
    await db.refresh(hit)
    return hit


@router.get("/job/{job_id}", response_model=list[SymbolHitRead])
async def list_hits_by_job(job_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SymbolHit).where(SymbolHit.job_id == job_id))
    return result.scalars().all()


@router.patch("/{hit_id}", response_model=SymbolHitRead)
async def update_symbol_hit(hit_id: UUID, body: SymbolHitUpdate, db: AsyncSession = Depends(get_db)):
    hit = await db.get(SymbolHit, hit_id)
    if not hit:
        raise HTTPException(404, "SymbolHit not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(hit, k, v)
    await db.commit()
    await db.refresh(hit)

    await _maybe_auto_generate_estimation(hit.job_id, db)

    return hit


async def _maybe_auto_generate_estimation(job_id: UUID, db: AsyncSession) -> None:
    """全ヒットがレビュー済み（ACCEPTED/REJECTED）になったら見積を自動生成する。"""
    pending_count = (
        await db.execute(
            select(func.count())
            .select_from(SymbolHit)
            .where(
                SymbolHit.job_id == job_id,
                SymbolHit.status.not_in(_REVIEW_TERMINAL),
            )
        )
    ).scalar_one()

    if pending_count > 0:
        return

    total = (
        await db.execute(
            select(func.count()).select_from(SymbolHit).where(SymbolHit.job_id == job_id)
        )
    ).scalar_one()

    if total == 0:
        return

    logger.info(f"全シンボルヒットがレビュー済み (job={job_id})。見積を自動生成します。")
    result = await generate_estimation(job_id, db)
    logger.info(f"見積自動生成完了: {result.generated} 件生成, {result.skipped} 件スキップ (job={job_id})")
