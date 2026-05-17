"""単価マスターの期限切れアラートサービス。"""
from __future__ import annotations

import logging
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import MasterItem

logger = logging.getLogger(__name__)


async def get_expiring_master_items(
    db: AsyncSession,
    days_ahead: int = 30,
) -> list[MasterItem]:
    """valid_until が days_ahead 日以内に切れる MasterItem を返す。"""
    today = date.today()
    threshold = today + timedelta(days=days_ahead)

    result = await db.execute(
        select(MasterItem)
        .where(
            MasterItem.valid_until != None,
            MasterItem.valid_until >= today,
            MasterItem.valid_until <= threshold,
        )
        .order_by(MasterItem.valid_until)
    )
    return result.scalars().all()


async def check_and_log_expiring_items(db: AsyncSession, days_ahead: int = 30) -> int:
    """期限切れ間近の単価マスターをログに出力し、件数を返す。"""
    items = await get_expiring_master_items(db, days_ahead)
    if not items:
        logger.info("単価マスター期限切れチェック: 期限切れ間近の項目はありません")
        return 0

    logger.warning(
        f"単価マスター期限切れ間近: {len(items)} 件が {days_ahead} 日以内に期限切れになります"
    )
    for item in items:
        logger.warning(
            f"  [{item.valid_until}] {item.symbol_code} / {item.item_name}"
            f" (region={item.region_code}, id={item.id})"
        )
    return len(items)
