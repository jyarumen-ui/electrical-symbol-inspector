"""図面アップロード・記号検出エンドポイント"""
from __future__ import annotations

import logging
import os
from typing import Any

import anthropic

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Job, SymbolHit
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
    logger.info("Upload start: %s (%s) size=%d", file.filename, content_type, len(file_bytes))

    page_image: str | None = None
    uncertain: list[dict[str, Any]] = []
    located_symbols: list[dict[str, Any]] = []
    img_width = 0
    img_height = 0

    try:
        if content_type == "application/pdf":
            symbols, page_image, uncertain, located_symbols, img_width, img_height = \
                detect_symbols_from_pdf(file_bytes, api_key)
        elif content_type in (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-excel",
        ):
            symbols, page_image, uncertain, located_symbols, img_width, img_height = \
                detect_symbols_from_excel(file_bytes, api_key)
        else:
            symbols, page_image, uncertain, located_symbols, img_width, img_height = \
                detect_symbols_from_image(file_bytes, content_type, api_key)
    except RuntimeError as e:
        logger.error("RuntimeError: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    except anthropic.RateLimitError as e:
        logger.error("RateLimitError: %s", e)
        raise HTTPException(status_code=429, detail="AI APIのレートリミットに達しました。しばらく待ってから再試行してください。")
    except anthropic.BadRequestError as e:
        logger.error("BadRequestError: %s", e)
        raise HTTPException(status_code=422, detail=f"画像処理エラー: {e}")
    except Exception as e:
        msg = str(e)
        logger.error("Upload error type=%s msg=%s", type(e).__name__, msg, exc_info=True)
        if "429" in msg or "rate_limit" in msg.lower():
            raise HTTPException(status_code=429, detail="AI APIのレートリミットに達しました。しばらく待ってから再試行してください。")
        raise HTTPException(status_code=500, detail=f"記号検出エラー: {msg}")

    rows = symbols_to_symbol_hit_rows(symbols, job_id=job_id)
    for obj in [SymbolHit(**row) for row in rows]:
        db.add(obj)
    await db.commit()

    return {
        "detected": len(rows),
        "filename": file.filename,
        "message": f"{len(rows)} 件の記号を検出しました",
        "page_image": page_image,
        "img_width": img_width,
        "img_height": img_height,
        "uncertain": uncertain,
        "located_symbols": located_symbols,
    }
