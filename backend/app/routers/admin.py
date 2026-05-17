"""管理・統計エンドポイント。"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Job, SymbolHit, MasterItem, EstimationItem
from ..services.alert_service import get_expiring_master_items
from ..services.archive_service import archive_old_jobs
from ..config import settings

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db)):
    """システム全体の統計情報を返す。"""
    job_counts = (
        await db.execute(
            select(Job.status, func.count().label("n"))
            .group_by(Job.status)
        )
    ).all()

    hit_counts = (
        await db.execute(
            select(SymbolHit.status, func.count().label("n"))
            .group_by(SymbolHit.status)
        )
    ).all()

    confidence_stats = (
        await db.execute(
            select(
                func.avg(SymbolHit.ai_confidence).label("avg"),
                func.min(SymbolHit.ai_confidence).label("min"),
                func.max(SymbolHit.ai_confidence).label("max"),
                func.count().label("total"),
            )
        )
    ).one()

    master_total = (
        await db.execute(select(func.count()).select_from(MasterItem))
    ).scalar_one()

    expiring = await get_expiring_master_items(db, settings.expiry_alert_days)

    estimation_total = (
        await db.execute(select(func.count()).select_from(EstimationItem))
    ).scalar_one()

    return {
        "jobs": {s: n for s, n in job_counts},
        "symbol_hits": {s: n for s, n in hit_counts},
        "confidence": {
            "avg": round(float(confidence_stats.avg or 0), 4),
            "min": round(float(confidence_stats.min or 0), 4),
            "max": round(float(confidence_stats.max or 0), 4),
            "total": confidence_stats.total,
        },
        "master_items": {
            "total": master_total,
            "expiring_soon": len(expiring),
        },
        "estimation_items": estimation_total,
    }


@router.post("/archive-jobs")
async def run_archive_jobs(days: int = 90, db: AsyncSession = Depends(get_db)):
    """COMPLETED かつ指定日数以上前のジョブを ARCHIVED に変更する。"""
    archived = await archive_old_jobs(db, days)
    return {"archived": archived, "days": days}
