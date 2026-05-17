"""図面アップロード・記号検出エンドポイント"""
from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..database import AsyncSessionLocal, get_db
from ..models import Job, SymbolHit

logger = logging.getLogger(__name__)
from ..services.drawing_service import (
    detect_symbols_from_excel,
    detect_symbols_from_image,
    detect_symbols_from_pdf,
    symbols_to_symbol_hit_rows,
)

router = APIRouter(prefix="/jobs", tags=["drawings"])

ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
}

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


@router.post("/{job_id}/drawings/upload")
async def upload_drawing(
    job_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """
    図面ファイル（PDF / PNG / JPEG / Excel）をアップロードし、
    Claude Vision で電気記号を検出して SymbolHit を一括登録する。
    """
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    content_type = (file.content_type or "").split(";")[0].strip()
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"非対応のファイル形式です: {content_type}。PDF / PNG / JPEG / Excel を使用してください。",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="ファイルサイズが50MBを超えています",
        )

    api_key = os.environ.get("ANTHROPIC_API_KEY")

    try:
        if content_type == "application/pdf":
            symbols = detect_symbols_from_pdf(file_bytes, api_key)
        elif content_type in (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
        ):
            symbols = detect_symbols_from_excel(file_bytes, api_key)
        else:
            symbols = detect_symbols_from_image(file_bytes, content_type, api_key)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"記号検出中にエラーが発生しました: {str(e)}",
        )

    rows = symbols_to_symbol_hit_rows(symbols, job_id=job_id)

    hit_objects = [SymbolHit(**row) for row in rows]
    auto_accepted = 0
    for obj in hit_objects:
        if obj.ai_confidence >= settings.auto_accept_threshold:
            obj.status = "ACCEPTED"
            auto_accepted += 1
        db.add(obj)
    await db.commit()

    return {
        "detected": len(rows),
        "auto_accepted": auto_accepted,
        "filename": file.filename,
        "message": f"{len(rows)} 件の記号を検出しました（うち {auto_accepted} 件を自動承認）",
    }


@router.post("/{job_id}/drawings/batch-upload")
async def batch_upload_drawings(
    job_id: str,
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """複数図面を受け取り、バックグラウンドで順次処理する。"""
    result = await db.execute(select(Job).where(Job.id == job_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Job not found")

    queued = []
    for file in files:
        content_type = (file.content_type or "").split(";")[0].strip()
        if content_type not in ALLOWED_CONTENT_TYPES:
            continue
        file_bytes = await file.read()
        if len(file_bytes) > MAX_FILE_SIZE:
            continue
        queued.append((file.filename, content_type, file_bytes))

    for filename, content_type, file_bytes in queued:
        background_tasks.add_task(_process_drawing_bg, job_id, filename, content_type, file_bytes)

    return {
        "queued": len(queued),
        "skipped": len(files) - len(queued),
        "message": f"{len(queued)} 件をバックグラウンド処理キューに追加しました",
    }


async def _process_drawing_bg(
    job_id: str, filename: str, content_type: str, file_bytes: bytes
) -> None:
    """バックグラウンドタスク用: 新規DBセッションで図面を処理する。"""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    try:
        if content_type == "application/pdf":
            symbols = detect_symbols_from_pdf(file_bytes, api_key)
        elif content_type in (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
        ):
            symbols = detect_symbols_from_excel(file_bytes, api_key)
        else:
            symbols = detect_symbols_from_image(file_bytes, content_type, api_key)
    except Exception as e:
        logger.error(f"バッチ処理エラー [{filename}]: {e}")
        return

    rows = symbols_to_symbol_hit_rows(symbols, job_id=job_id)
    async with AsyncSessionLocal() as db:
        auto_accepted = 0
        for row in rows:
            obj = SymbolHit(**row)
            if obj.ai_confidence >= settings.auto_accept_threshold:
                obj.status = "ACCEPTED"
                auto_accepted += 1
            db.add(obj)
        await db.commit()

    logger.info(f"バッチ処理完了 [{filename}]: {len(rows)} 件検出, {auto_accepted} 件自動承認")
