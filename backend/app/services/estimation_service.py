from collections import defaultdict
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import EstimationItem, SymbolHit, MasterItem, Job
from ..schemas.estimation import EstimationSummary, GenerateEstimationResponse, EstimationItemRead

_SKIP_STATUSES = {"REJECTED"}


async def generate_estimation(job_id: UUID, db: AsyncSession) -> GenerateEstimationResponse:
    """既存の見積明細を削除してから SymbolHit を symbol_code ごとに集計して再生成する。"""
    today = date.today()

    job = await db.get(Job, job_id)
    if not job:
        raise ValueError(f"Job {job_id} not found")

    # 既存の見積明細を全削除（再生成）
    await db.execute(delete(EstimationItem).where(EstimationItem.job_id == job_id))
    await db.flush()

    hits_result = await db.execute(
        select(SymbolHit).where(SymbolHit.job_id == job_id)
    )
    hits = hits_result.scalars().all()

    # REJECTED を除いて symbol_code ごとに集計
    groups: dict[str, list[SymbolHit]] = defaultdict(list)
    skipped = 0
    for hit in hits:
        if hit.status in _SKIP_STATUSES:
            skipped += 1
            continue
        groups[hit.symbol_code].append(hit)

    generated_items = []

    for symbol_code, code_hits in groups.items():
        quantity = Decimal(str(len(code_hits)))
        representative = code_hits[0]

        master = await _find_master_item(symbol_code, job.region_code, today, db)
        if master is None:
            master = await _find_master_item(symbol_code, "DEFAULT", today, db)

        if master:
            unit_price = master.material_cost + master.labor_cost
            amount = quantity * unit_price
            item = EstimationItem(
                job_id=job_id,
                symbol_hit_id=representative.id,
                master_item_id=master.id,
                symbol_code=symbol_code,
                item_name=master.item_name,
                maker=master.maker,
                model_number=master.model_number,
                quantity=quantity,
                unit=master.unit,
                unit_price=unit_price,
                amount=amount,
                status="CONFIRMED",
            )
        else:
            item = EstimationItem(
                job_id=job_id,
                symbol_hit_id=representative.id,
                symbol_code=symbol_code,
                item_name=f"[未登録] {symbol_code}  {representative.label or ''}".strip(),
                quantity=quantity,
                unit="個",
                unit_price=Decimal("0.00"),
                amount=Decimal("0.00"),
                status="PENDING",
                note="単価マスター未登録 — 「単価マスター」ページで登録してください",
            )

        db.add(item)
        generated_items.append(item)

    await db.commit()
    for item in generated_items:
        await db.refresh(item)

    return GenerateEstimationResponse(
        generated=len(generated_items),
        skipped=skipped,
        items=[EstimationItemRead.model_validate(i) for i in generated_items],
    )


async def get_estimation_summary(job_id: UUID, db: AsyncSession) -> EstimationSummary:
    result = await db.execute(
        select(EstimationItem).where(EstimationItem.job_id == job_id)
    )
    all_items = result.scalars().all()

    confirmed = [i for i in all_items if i.status == "CONFIRMED"]
    pending = [i for i in all_items if i.status == "PENDING"]
    excluded_count = sum(1 for i in all_items if i.status == "EXCLUDED")

    # CONFIRMED + PENDING を合計対象とする（全検出済みを見積金額に反映）
    billable = [i for i in all_items if i.status in ("CONFIRMED", "PENDING")]
    subtotal = sum(i.amount for i in billable)
    all_with_rate = confirmed or pending
    misc_rate = all_with_rate[0].misc_rate if all_with_rate else Decimal("0.15")
    tax_rate = all_with_rate[0].tax_rate if all_with_rate else Decimal("0.10")
    misc_fee = subtotal * misc_rate
    tax = (subtotal + misc_fee) * tax_rate
    grand_total = subtotal + misc_fee + tax

    return EstimationSummary(
        job_id=job_id,
        confirmed_items=[EstimationItemRead.model_validate(i) for i in confirmed],
        pending_items=[EstimationItemRead.model_validate(i) for i in pending],
        excluded_count=excluded_count,
        subtotal=subtotal,
        misc_fee=misc_fee,
        tax=tax,
        grand_total=grand_total,
    )


async def _find_master_item(
    symbol_code: str, region_code: str, as_of: date, db: AsyncSession
) -> MasterItem | None:
    result = await db.execute(
        select(MasterItem).where(
            MasterItem.symbol_code == symbol_code,
            MasterItem.region_code == region_code,
            MasterItem.valid_from <= as_of,
            (MasterItem.valid_until == None) | (MasterItem.valid_until >= as_of),
        ).order_by(MasterItem.valid_from.desc()).limit(1)
    )
    return result.scalar_one_or_none()
