from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import MasterItem, MasterItemHistory
from ..schemas import MasterItemCreate, MasterItemRead, MasterItemUpdate, MasterItemHistoryRead

router = APIRouter(prefix="/master-items", tags=["master-items"])


@router.get("", response_model=list[MasterItemRead])
async def list_master_items(
    symbol_code: str | None = None,
    region_code: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(MasterItem).order_by(MasterItem.symbol_code, MasterItem.valid_from.desc())
    if symbol_code:
        q = q.where(MasterItem.symbol_code == symbol_code)
    if region_code:
        q = q.where(MasterItem.region_code == region_code)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=MasterItemRead, status_code=201)
async def create_master_item(body: MasterItemCreate, db: AsyncSession = Depends(get_db)):
    item = MasterItem(**body.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.get("/{item_id}", response_model=MasterItemRead)
async def get_master_item(item_id: UUID, db: AsyncSession = Depends(get_db)):
    item = await db.get(MasterItem, item_id)
    if not item:
        raise HTTPException(404, "MasterItem not found")
    return item


@router.put("/{item_id}", response_model=MasterItemRead)
async def update_master_item(
    item_id: UUID,
    body: MasterItemUpdate,
    changed_by: str = "system",
    db: AsyncSession = Depends(get_db),
):
    item = await db.get(MasterItem, item_id)
    if not item:
        raise HTTPException(404, "MasterItem not found")

    # Save history snapshot before mutating
    old_snapshot = {
        "symbol_code": item.symbol_code,
        "item_name": item.item_name,
        "maker": item.maker,
        "model_number": item.model_number,
        "grade": item.grade,
        "unit": item.unit,
        "material_cost": str(item.material_cost),
        "labor_cost": str(item.labor_cost),
        "region_code": item.region_code,
        "valid_from": str(item.valid_from),
        "valid_until": str(item.valid_until) if item.valid_until else None,
    }
    history = MasterItemHistory(master_item_id=item.id, changed_by=changed_by, old_values=old_snapshot)
    db.add(history)

    for k, v in body.model_dump(exclude_none=True).items():
        setattr(item, k, v)

    await db.commit()
    await db.refresh(item)
    return item


@router.get("/{item_id}/history", response_model=list[MasterItemHistoryRead])
async def get_master_item_history(item_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(MasterItemHistory)
        .where(MasterItemHistory.master_item_id == item_id)
        .order_by(MasterItemHistory.changed_at.desc())
    )
    return result.scalars().all()
