"""古いジョブを論理削除（ARCHIVED）するサービス。"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Job

logger = logging.getLogger(__name__)


async def archive_old_jobs(db: AsyncSession, days: int = 90) -> int:
    """COMPLETED かつ updated_at が days 日以上前のジョブを ARCHIVED に変更し、件数を返す。"""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    result = await db.execute(
        select(Job).where(
            Job.status == "COMPLETED",
            Job.updated_at < cutoff,
        )
    )
    jobs = result.scalars().all()

    for job in jobs:
        job.status = "ARCHIVED"

    if jobs:
        await db.commit()
        logger.info(f"ジョブアーカイブ: {len(jobs)} 件を ARCHIVED に変更しました（{days}日以上前）")
    else:
        logger.info("ジョブアーカイブ: 対象なし")

    return len(jobs)
