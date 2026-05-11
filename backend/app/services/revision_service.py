from uuid import UUID
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import SymbolHit, JobRevision

PROXIMITY_THRESHOLD = 5.0  # mm / unit tolerance for "same symbol" matching


def _is_near(a: SymbolHit, b: SymbolHit) -> bool:
    if a.x is None or b.x is None:
        return False
    return (abs(float(a.x) - float(b.x)) <= PROXIMITY_THRESHOLD and
            abs(float(a.y) - float(b.y)) <= PROXIMITY_THRESHOLD)


async def compare_revisions(job_id: UUID, rev_a_id: UUID, rev_b_id: UUID, db: AsyncSession) -> dict:
    """Compare two revisions and classify symbol hits as ADDED / REMOVED / CHANGED / UNCHANGED."""
    hits_a_result = await db.execute(
        select(SymbolHit).where(SymbolHit.job_id == job_id, SymbolHit.revision_id == rev_a_id)
    )
    hits_b_result = await db.execute(
        select(SymbolHit).where(SymbolHit.job_id == job_id, SymbolHit.revision_id == rev_b_id)
    )
    hits_a = hits_a_result.scalars().all()
    hits_b = hits_b_result.scalars().all()

    matched_b_ids = set()
    added = []
    removed = []
    changed = []
    unchanged = []

    for hit_a in hits_a:
        # Find counterpart in B: same symbol_code within proximity
        match = next(
            (b for b in hits_b
             if b.id not in matched_b_ids
             and b.symbol_code == hit_a.symbol_code
             and _is_near(hit_a, b)),
            None,
        )
        if match:
            matched_b_ids.add(match.id)
            unchanged.append({"from": hit_a.id, "to": match.id, "symbol_code": hit_a.symbol_code})
        else:
            # Check if nearby hit exists with different symbol_code (=changed)
            nearby = next(
                (b for b in hits_b
                 if b.id not in matched_b_ids and _is_near(hit_a, b)),
                None,
            )
            if nearby:
                matched_b_ids.add(nearby.id)
                changed.append({
                    "from_id": hit_a.id,
                    "to_id": nearby.id,
                    "from_code": hit_a.symbol_code,
                    "to_code": nearby.symbol_code,
                })
            else:
                removed.append({"id": hit_a.id, "symbol_code": hit_a.symbol_code})

    for hit_b in hits_b:
        if hit_b.id not in matched_b_ids:
            added.append({"id": hit_b.id, "symbol_code": hit_b.symbol_code})

    return {
        "added": added,
        "removed": removed,
        "changed": changed,
        "unchanged_count": len(unchanged),
        "summary": {
            "added_count": len(added),
            "removed_count": len(removed),
            "changed_count": len(changed),
        },
    }
