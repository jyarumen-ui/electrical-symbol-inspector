from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import SymbolHit
from ..schemas import SymbolHitCreate, SymbolHitRead, SymbolHitUpdate

router = APIRouter(prefix="/symbol-hits", tags=["symbol-hits"])


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
    return hit
