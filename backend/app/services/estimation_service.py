from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import EstimationItem, SymbolHit, MasterItem, Job
from ..schemas.estimation import EstimationSummary, GenerateEstimationResponse, EstimationItemRead

# HOLD/UNASSIGNED → PENDING, ACCEPTED → CONFIRMED, REJECTED → skip
_STATUS_MAP = {
    "ACCEPTED": "CONFIRMED",
    "HOLD": "PENDING",
    "UNASSIGNED": "PENDING",
    "REJECTED": None,
}


async def generate_estimation(job_id: UUID, db: AsyncSession) -> GenerateEstimationResponse:
    """Convert SymbolHits into EstimationItems using current MasterItem prices."""
    today = date.today()

    # Load job for region_code
    job = await db.get(Job, job_id)
    if not job:
        raise ValueError(f"Job {job_id} not found")

    # Load all symbol hits for job that are not already in estimation
    existing_hit_ids = (
        await db.execute(
            select(EstimationItem.symbol_hit_id).where(EstimationItem.job_id == job_id)
        )
    ).scalars().all()

    hits_result = await db.execute(
        select(SymbolHit).where(
            SymbolHit.job_id == job_id,
            SymbolHit.id.not_in(existing_hit_ids) if existing_hit_ids else True,
        )
    )
    hits = hits_result.scalars().all()

    generated_items = []
    skipped = 0

    for hit in hits:
        est_status = _STATUS_MAP.get(hit.status)
        if est_status is None:
            skipped += 1
            continue

        # Find matching master item: symbol_code + region_code, valid at today
        master = await _find_master_item(hit.symbol_code, job.region_code, today, db)
        if master is None:
            # Try DEFAULT region fallback
            master = await _find_master_item(hit.symbol_code, "DEFAULT", today, db)

        if master:
            unit_price = master.material_cost + master.labor_cost
            quantity = Decimal("1.000")
            amount = quantity * unit_price
            item = EstimationItem(
                job_id=job_id,
                symbol_hit_id=hit.id,
                master_item_id=master.id,
                symbol_code=hit.symbol_code,
                item_name=master.item_name,
                maker=master.maker,
                model_number=master.model_number,
                quantity=quantity,
                unit=master.unit,
                unit_price=unit_price,
                amount=amount,
                status=est_status,
            )
        else:
            # No master data — create PENDING placeholder
            item = EstimationItem(
                job_id=job_id,
                symbol_hit_id=hit.id,
                symbol_code=hit.symbol_code,
                item_name=f"[未登録] {hit.symbol_code}",
                quantity=Decimal("1.000"),
                unit="個",
                unit_price=Decimal("0.00"),
                amount=Decimal("0.00"),
                status="PENDING",
                note="単価マスター未登録",
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

    subtotal = sum(i.amount for i in confirmed)
    # Use first item's rates as representative (or defaults)
    misc_rate = confirmed[0].misc_rate if confirmed else Decimal("0.15")
    tax_rate = confirmed[0].tax_rate if confirmed else Decimal("0.10")
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
