"""
図面ファイル（PDF/画像）から電気記号を検出し SymbolHit を生成するサービス。
PDF は PyMuPDF でページ画像に変換し、Claude Vision で記号を解析する。
"""
from __future__ import annotations

import base64
import io
import json
import re
import uuid
from typing import Any

import logging

import anthropic
from PIL import Image

logger = logging.getLogger(__name__)

SYMBOL_DETECTION_PROMPT = """
あなたは電気設備の図面（平面図・配線図）を解析する専門エキスパートです。
以下の図面画像に含まれる電気記号をすべて検出し、JSON 形式で返してください。

## 出力フォーマット（JSON のみ。説明文は不要）
{
  "symbols": [
    {
      "symbol_code": "SW-1P",
      "label": "単極スイッチ",
      "confidence": 0.95,
      "x": 120.5,
      "y": 340.0,
      "page": 1,
      "candidates": [
        {"symbol_code": "SW-1P", "label": "単極スイッチ", "score": 0.95},
        {"symbol_code": "SW-3P", "label": "3路スイッチ", "score": 0.30}
      ]
    }
  ],
  "page_width": 842,
  "page_height": 595
}

## 主要な記号コード一覧（参考）
- SW-1P  : 単極スイッチ（●や○に斜線）
- SW-3P  : 3路スイッチ（3と斜線）
- RCPT-2P: 2口コンセント（⊕や横棒2本）
- RCPT-E : アース付きコンセント（⊕にEマーク）
- BRK-20A: 配線用遮断器20A（□にB20）
- BRK-30A: 配線用遮断器30A（□にB30）
- LEAK-20A: 漏電遮断器20A（□にELB）
- LIGHT-F40: 蛍光灯器具40W（長方形に×）
- LIGHT-LED: LED照明器具（丸や六角形）
- CABLE-CV2: CV2mm²ケーブル（線に2）
- CABLE-CV5.5: CV5.5mm²ケーブル（線に5.5）
- CONDUIT-28: 電線管28mm（□の線）
- PANEL-100A: 分電盤100A（大きな□）
- EV-CHG : EV充電器（EV文字）
- SENSOR-PIR: 人感センサー（○に波線）

## 注意事項
- 座標 (x, y) は画像左上を原点とするピクセル値
- confidence は 0.0〜1.0 の確信度
- 不明な記号は symbol_code を "UNKNOWN" とし confidence を低く設定
- candidates は確信度の高い順に最大3件まで
- 検出できない場合は symbols を空配列で返す
"""


def _pdf_to_images(pdf_bytes: bytes, dpi: int = 150) -> list[tuple[bytes, int, int]]:
    """PDF を各ページの PNG バイト列に変換する。(png_bytes, width, height) のリストを返す。"""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise RuntimeError("PyMuPDF がインストールされていません: pip install PyMuPDF")

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    results: list[tuple[bytes, int, int]] = []
    mat = fitz.Matrix(dpi / 72, dpi / 72)

    for page in doc:
        pix = page.get_pixmap(matrix=mat)
        png_bytes = pix.tobytes("png")
        results.append((png_bytes, pix.width, pix.height))

    doc.close()
    return results


def _excel_to_images(excel_bytes: bytes) -> list[tuple[bytes, int, int]]:
    """
    Excel ファイルを画像に変換する（簡易版）。
    openpyxl で埋め込み画像を抽出し、なければ文字でフォールバック。
    """
    try:
        import openpyxl
        from openpyxl.drawing.image import Image as XlImage
    except ImportError:
        raise RuntimeError("openpyxl がインストールされていません")

    wb = openpyxl.load_workbook(io.BytesIO(excel_bytes))
    images: list[tuple[bytes, int, int]] = []

    for ws in wb.worksheets:
        for drawing in getattr(ws, "_images", []):
            try:
                img = Image.open(io.BytesIO(drawing._data()))
                buf = io.BytesIO()
                img.save(buf, format="PNG")
                w, h = img.size
                images.append((buf.getvalue(), w, h))
            except Exception:
                pass

    return images


def _encode_image(png_bytes: bytes) -> str:
    """PNG バイト列を base64 エンコードする。"""
    return base64.standard_b64encode(png_bytes).decode("utf-8")


def _call_claude_vision(
    client: anthropic.Anthropic,
    png_bytes: bytes,
    page_num: int,
) -> list[dict[str, Any]]:
    """Claude Vision で1ページを解析し symbols リストを返す。"""
    b64 = _encode_image(png_bytes)

    message = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=4096,
        thinking={"type": "adaptive"},
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": b64,
                        },
                    },
                    {
                        "type": "text",
                        "text": SYMBOL_DETECTION_PROMPT,
                    },
                ],
            }
        ],
    )

    usage = message.usage
    logger.info(
        f"Claude API usage | page={page_num} "
        f"input_tokens={usage.input_tokens} output_tokens={usage.output_tokens} "
        f"est_cost_usd={usage.input_tokens * 0.000015 + usage.output_tokens * 0.000075:.4f}"
    )

    # テキストブロックからJSONを抽出
    text = ""
    for block in message.content:
        if block.type == "text":
            text = block.text
            break

    # JSONブロックを抽出（マークダウンコードブロック対応）
    json_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if json_match:
        text = json_match.group(1)
    else:
        # コードブロックなしの生JSON
        brace_start = text.find("{")
        brace_end = text.rfind("}")
        if brace_start != -1 and brace_end != -1:
            text = text[brace_start : brace_end + 1]

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return []

    symbols = data.get("symbols", [])
    # ページ番号を付与
    for s in symbols:
        s["page"] = page_num

    return symbols


def detect_symbols_from_pdf(
    pdf_bytes: bytes,
    anthropic_api_key: str | None = None,
) -> list[dict[str, Any]]:
    """PDF から全ページを解析し symbol_hit 作成用データのリストを返す。"""
    client = anthropic.Anthropic(api_key=anthropic_api_key)
    pages = _pdf_to_images(pdf_bytes)
    all_symbols: list[dict[str, Any]] = []

    for page_num, (png_bytes, w, h) in enumerate(pages, start=1):
        symbols = _call_claude_vision(client, png_bytes, page_num)
        all_symbols.extend(symbols)

    return all_symbols


def detect_symbols_from_image(
    image_bytes: bytes,
    content_type: str,
    anthropic_api_key: str | None = None,
) -> list[dict[str, Any]]:
    """PNG/JPEG 画像から記号を検出する。"""
    client = anthropic.Anthropic(api_key=anthropic_api_key)

    # PNG に統一変換
    img = Image.open(io.BytesIO(image_bytes))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    png_bytes = buf.getvalue()

    return _call_claude_vision(client, png_bytes, page_num=1)


def detect_symbols_from_excel(
    excel_bytes: bytes,
    anthropic_api_key: str | None = None,
) -> list[dict[str, Any]]:
    """Excel ファイルから埋め込み画像を抽出して記号を検出する。"""
    client = anthropic.Anthropic(api_key=anthropic_api_key)
    pages = _excel_to_images(excel_bytes)

    if not pages:
        return []

    all_symbols: list[dict[str, Any]] = []
    for page_num, (png_bytes, w, h) in enumerate(pages, start=1):
        symbols = _call_claude_vision(client, png_bytes, page_num)
        all_symbols.extend(symbols)

    return all_symbols


def symbols_to_symbol_hit_rows(
    symbols: list[dict[str, Any]],
    job_id: str,
    revision_id: str | None = None,
) -> list[dict[str, Any]]:
    """検出された記号データを SymbolHit テーブル挿入用の辞書リストに変換する。"""
    rows = []
    for sym in symbols:
        candidates = sym.get("candidates", [])
        if not candidates:
            candidates = [
                {
                    "symbol_code": sym.get("symbol_code", "UNKNOWN"),
                    "label": sym.get("label", ""),
                    "score": sym.get("confidence", 0.5),
                }
            ]

        rows.append(
            {
                "id": str(uuid.uuid4()),
                "job_id": job_id,
                "revision_id": revision_id,
                "symbol_code": sym.get("symbol_code", "UNKNOWN"),
                "label": sym.get("label", ""),
                "ai_confidence": float(sym.get("confidence", 0.5)),
                "ai_candidates": candidates,
                "x": float(sym.get("x", 0)),
                "y": float(sym.get("y", 0)),
                "page": int(sym.get("page", 1)),
                "status": "UNASSIGNED",
            }
        )
    return rows
