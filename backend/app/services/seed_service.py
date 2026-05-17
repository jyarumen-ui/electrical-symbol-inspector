"""マスターデータの初期投入サービス。DB が空のときのみ実行する。"""
from __future__ import annotations

import logging
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import MasterItem

logger = logging.getLogger(__name__)

_SEED_DATA = [
    # symbol_code, item_name, maker, model_number, grade, unit, material_cost, labor_cost
    ("SW-1P",       "単極スイッチ",           "パナソニック", "WN5001W",        "標準",   "個", 450,   800),
    ("SW-3P",       "3路スイッチ",            "パナソニック", "WN5002W",        "標準",   "個", 650,   900),
    ("RCPT-2P",     "2口コンセント",          "パナソニック", "WN1002W",        "標準",   "個", 380,   700),
    ("RCPT-E",      "アース付きコンセント",   "パナソニック", "WN1302WP",       "標準",   "個", 520,   850),
    ("BRK-20A",     "配線用遮断器20A",        "三菱電機",     "BH-K",           "標準",   "個", 2800,  1500),
    ("BRK-30A",     "配線用遮断器30A",        "三菱電機",     "BH-K",           "標準",   "個", 3200,  1500),
    ("LEAK-20A",    "漏電遮断器20A",          "パナソニック", "BKW2031",        "標準",   "個", 4500,  1800),
    ("LIGHT-F40",   "蛍光灯器具40W",          "パナソニック", "FLR40SW",        "標準",   "台", 8500,  3500),
    ("LIGHT-LED",   "LED照明器具",            "東芝",         "LEKR412563N",    "省エネ", "台", 15000, 3500),
    ("CABLE-CV2",   "CV2mm²",                 None,           None,             None,     "m",  85,    120),
    ("CABLE-CV5.5", "CV5.5mm²",               None,           None,             None,     "m",  180,   150),
    ("CONDUIT-28",  "硬質塩化ビニル管28mm",   None,           None,             None,     "m",  220,   400),
    ("PANEL-100A",  "分電盤100A",             "河村電器",     "ZEAL E100-30",   "標準",   "面", 45000, 25000),
    ("EV-CHG",      "EV充電器",               "パナソニック", "BHEF5003",       "高機能", "台", 85000, 35000),
    ("SENSOR-PIR",  "人感センサー",           "パナソニック", "WTK14895W",      "標準",   "個", 2200,  1200),
]


async def seed_if_empty(db: AsyncSession) -> int:
    """master_items が空のときのみシードデータを投入し、投入件数を返す。"""
    count = (await db.execute(select(func.count()).select_from(MasterItem))).scalar_one()
    if count > 0:
        logger.info(f"単価マスター初期投入をスキップ: 既存 {count} 件")
        return 0

    items = [
        MasterItem(
            symbol_code=row[0],
            item_name=row[1],
            maker=row[2],
            model_number=row[3],
            grade=row[4],
            unit=row[5],
            material_cost=row[6],
            labor_cost=row[7],
            region_code="DEFAULT",
            valid_from=date(2024, 1, 1),
        )
        for row in _SEED_DATA
    ]
    for item in items:
        db.add(item)
    await db.commit()

    logger.info(f"単価マスター初期投入: {len(items)} 件を投入しました")
    return len(items)
