"""
サンプル単価マスターデータの投入スクリプト（手動実行用）
使用方法: python seed_master_items.py
"""
import asyncio
from app.database import AsyncSessionLocal
from app.services.seed_service import seed_if_empty


async def main():
    async with AsyncSessionLocal() as db:
        count = await seed_if_empty(db)
    if count == 0:
        print("スキップ: 既にデータが存在します（強制投入は DB を直接操作してください）")
    else:
        print(f"✓ {count} 件の単価マスターデータを投入しました")


if __name__ == "__main__":
    asyncio.run(main())
