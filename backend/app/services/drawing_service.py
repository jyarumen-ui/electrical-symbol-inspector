"""
電気記号検出サービス。
4パス精度向上方式：
  Pass1 = 全体カウント（temp=0）
  Pass2 = 再確認＋不確かな箇所の座標（temp=0）
  Pass3 = タイル分割して高精細カウント（大きい画像のみ）
  Pass4 = 記号の位置座標を全件取得（表示用）
  → カウントは全パスの最大値をマージ、座標はPass4の結果を使用
"""
from __future__ import annotations

import base64
import io
import json
import logging
import re
import time
import uuid
from collections import defaultdict
from typing import Any

import anthropic
from PIL import Image

logger = logging.getLogger(__name__)

# ── プロンプト ──────────────────────────────────────────────────────────────────

_SYMBOL_LIST = """
スイッチ: SW-1P(単極○斜線) SW-3P(3路) SW-4P(4路) SW-WP(防水)
コンセント: RCPT-2P(2口⊕) RCPT-E(アース付⊕E) RCPT-WP(防水) RCPT-20A(20A)
照明: LIGHT-F40(蛍光40W長方形×) LIGHT-F20(蛍光20W) LIGHT-LED(LED丸/六角) LIGHT-DL(ダウンライト) LIGHT-EX(非常灯)
遮断器: BRK-20A(□B20) BRK-30A BRK-50A LEAK-20A(□ELB) LEAK-30A
分電盤: PANEL-100A PANEL-60A
設備: EV-CHG AC-UNIT AC-OUT SENSOR-PIR(人感○波線) SMOKE(煙感知器○) FIRE-ALM PHONE LAN
ケーブル管: CABLE-CV2 CABLE-CV5.5 CABLE-CV8 CABLE-VVF CONDUIT-16 CONDUIT-28 CONDUIT-36
"""

COUNT_PROMPT = f"""あなたは日本の電気設備図面（JIS規格）の解析専門家です。
この図面画像に描かれている電気記号を種類ごとに数えてください。

## 出力（JSONのみ・説明文不要）
{{"counts":{{"SW-1P":3,"RCPT-2P":5,"LIGHT-F40":8}},"confidence":0.9}}

## 電気記号コード一覧
{_SYMBOL_LIST}

## ルール
- 図面上の記号をすべて数える（凡例説明図・タイトル欄の見本は除く）
- 同一種類の記号は必ず全数カウント
- 確信が持てない記号は "UNKNOWN" として counts に含める
- 電気記号がまったくない場合のみ counts を {{}} にする
"""

VERIFY_PROMPT = f"""この図面を再度注意深く確認してください。

## やること
1. 電気記号を再カウント（見落としがないか隅まで確認）
2. 判断に自信がない箇所の座標を報告

## 出力（JSONのみ）
{{"counts":{{"SW-1P":3}},"uncertain":[{{"id":"u1","symbol_code":"SW-3P","x":450,"y":230,"reason":"3路か4路か判断しにくい"}}]}}

## 座標
x, y: 画像左上を(0,0)とするピクセル座標（記号の中心）

## 電気記号コード一覧
{_SYMBOL_LIST}

uncertain: 確信が持てない箇所のみ。問題なければ []
"""

TILE_PROMPT = f"""この図面の一部分を拡大した画像です。
この範囲内にある電気記号を種類ごとに数えてください。

## 出力（JSONのみ）
{{"counts":{{"SW-1P":2,"RCPT-2P":1}}}}

## 電気記号コード一覧
{_SYMBOL_LIST}

## ルール
- この範囲内に見える記号のみカウント
- 画像端で途中で切れている記号も数える
- 見本・凡例は除く
"""

# ── 定数 ────────────────────────────────────────────────────────────────────────

MAX_IMAGE_BYTES = 4 * 1024 * 1024
MAX_IMAGE_DIM = 2000
DISPLAY_MAX_DIM = 1600   # 表示 & 座標検出に使う解像度
TILE_SIZE = 900
TILE_THRESHOLD = 1000

LABELS: dict[str, str] = {
    "SW-1P": "単極スイッチ", "SW-3P": "3路スイッチ", "SW-4P": "4路スイッチ", "SW-WP": "防水スイッチ",
    "RCPT-2P": "2口コンセント", "RCPT-E": "アース付コンセント", "RCPT-WP": "防水コンセント",
    "RCPT-20A": "20Aコンセント",
    "LIGHT-F40": "蛍光灯40W", "LIGHT-F20": "蛍光灯20W", "LIGHT-LED": "LED照明",
    "LIGHT-DL": "ダウンライト", "LIGHT-EX": "非常灯",
    "BRK-20A": "遮断器20A", "BRK-30A": "遮断器30A", "BRK-50A": "遮断器50A",
    "LEAK-20A": "漏電遮断器20A", "LEAK-30A": "漏電遮断器30A",
    "PANEL-100A": "分電盤100A", "PANEL-60A": "分電盤60A",
    "EV-CHG": "EV充電器", "AC-UNIT": "エアコン室内機", "AC-OUT": "エアコン室外機",
    "SENSOR-PIR": "人感センサー", "SMOKE": "煙感知器", "FIRE-ALM": "発信機",
    "PHONE": "電話", "LAN": "LAN",
    "CABLE-CV2": "CV2mm²", "CABLE-CV5.5": "CV5.5mm²", "CABLE-CV8": "CV8mm²",
    "CABLE-VVF": "VVFケーブル",
    "CONDUIT-16": "電線管16mm", "CONDUIT-28": "電線管28mm", "CONDUIT-36": "電線管36mm",
    "UNKNOWN": "不明記号",
}


# ── 画像ユーティリティ ────────────────────────────────────────────────────────────

def _get_display_bytes(img_bytes: bytes) -> tuple[bytes, int, int]:
    """
    表示用 & 座標検出用の共通画像を生成する。
    JPEG max DISPLAY_MAX_DIM px。
    戻り値: (jpeg_bytes, width, height)
    """
    img = Image.open(io.BytesIO(img_bytes))
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    w, h = img.size
    if max(w, h) > DISPLAY_MAX_DIM:
        scale = DISPLAY_MAX_DIM / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        w, h = img.size
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG", quality=85)
    return buf.getvalue(), w, h


def _to_api_image(img_bytes: bytes) -> tuple[str, str]:
    """Claude API 送信用 (base64, media_type)。4MB 超なら縮小。"""
    if len(img_bytes) > MAX_IMAGE_BYTES:
        img = Image.open(io.BytesIO(img_bytes))
        w, h = img.size
        scale = min(MAX_IMAGE_DIM / max(w, h), 1.0)
        if scale < 1.0:
            img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="JPEG", quality=75)
        img_bytes = buf.getvalue()
    mt = "image/jpeg" if img_bytes[:2] == b"\xff\xd8" else "image/png"
    return base64.standard_b64encode(img_bytes).decode(), mt


def _tile_image(img_bytes: bytes) -> list[tuple[bytes, int, int]]:
    """非重複タイル分割。戻り値: [(tile_bytes, x_offset, y_offset), ...]"""
    img = Image.open(io.BytesIO(img_bytes))
    w, h = img.size
    tiles = []
    for y0 in range(0, h, TILE_SIZE):
        for x0 in range(0, w, TILE_SIZE):
            tile = img.crop((x0, y0, min(x0 + TILE_SIZE, w), min(y0 + TILE_SIZE, h)))
            buf = io.BytesIO()
            tile.convert("RGB").save(buf, format="JPEG", quality=85)
            tiles.append((buf.getvalue(), x0, y0))
    return tiles


def _pdf_to_images(pdf_bytes: bytes, dpi: int = 150) -> list[bytes]:
    try:
        import fitz
    except ImportError:
        raise RuntimeError("PyMuPDF がインストールされていません")
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages: list[bytes] = []
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    for page in doc:
        pix = page.get_pixmap(matrix=mat)
        pages.append(pix.tobytes("png"))
    doc.close()
    return pages


def _excel_to_images(excel_bytes: bytes) -> list[bytes]:
    try:
        import openpyxl
    except ImportError:
        raise RuntimeError("openpyxl がインストールされていません")
    wb = openpyxl.load_workbook(io.BytesIO(excel_bytes))
    images: list[bytes] = []
    for ws in wb.worksheets:
        for drawing in getattr(ws, "_images", []):
            try:
                img_obj = Image.open(io.BytesIO(drawing._data()))
                buf = io.BytesIO()
                img_obj.convert("RGB").save(buf, format="PNG")
                images.append(buf.getvalue())
            except Exception:
                pass
    return images


# ── Claude 呼び出し ───────────────────────────────────────────────────────────────

def _parse_json(text: str) -> dict[str, Any]:
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if m:
        text = m.group(1)
    else:
        s, e = text.find("{"), text.rfind("}")
        if s != -1 and e != -1:
            text = text[s: e + 1]
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {}


def _call(client: anthropic.Anthropic, img_bytes: bytes, prompt: str, max_tokens: int = 2048) -> dict[str, Any]:
    b64, mt = _to_api_image(img_bytes)
    for attempt in range(3):
        try:
            msg = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=max_tokens,
                temperature=0,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "image", "source": {"type": "base64", "media_type": mt, "data": b64}},
                        {"type": "text", "text": prompt},
                    ],
                }],
            )
            break
        except anthropic.RateLimitError:
            if attempt == 2:
                raise
            wait = 30 * (attempt + 1)
            logger.warning("RateLimit, waiting %ds", wait)
            time.sleep(wait)
    else:
        return {}
    text = next((b.text for b in msg.content if b.type == "text"), "")
    logger.info("Claude(%d chars): %s", len(text), text[:300])
    return _parse_json(text)


def _safe_counts(raw: dict[str, Any]) -> dict[str, int]:
    result: dict[str, int] = {}
    for k, v in raw.get("counts", {}).items():
        try:
            n = int(v)
            if n > 0:
                result[k] = n
        except (TypeError, ValueError):
            pass
    return result


# ── 記号位置検出（Pass 4） ────────────────────────────────────────────────────────

def _locate_symbols(
    client: anthropic.Anthropic,
    display_bytes: bytes,
    merged_counts: dict[str, int],
) -> list[dict[str, Any]]:
    """
    検出済み記号の位置座標を全件取得する（表示・番号付けのため）。
    コンパクトな {"コード":[[x,y],...]} 形式を使いトークン消費を抑える。
    """
    if not merged_counts:
        return []

    expected = "\n".join(
        f"- {code}: {n}個"
        for code, n in sorted(merged_counts.items())
    )
    img_tmp = Image.open(io.BytesIO(display_bytes))
    dw, dh = img_tmp.size
    prompt = f"""この電気設備図面（画像サイズ: {dw}×{dh}ピクセル）に以下の電気記号があります。
各記号の全インスタンスの中心座標を報告してください。

## 検出済み記号
{expected}

## 出力（JSONのみ・説明文一切不要）
記号コードをキー、座標リスト（[x,y]の配列）を値にするJSON:
{{"SW-1P":[[120,350],[450,200]],"RCPT-2P":[[300,180]]}}

## 座標ルール
- x: 0〜{dw}（左端=0、右端={dw}）
- y: 0〜{dh}（上端=0、下端={dh}）
- 記号の中心点のピクセル座標
- 凡例・タイトル欄の記号は除く
- 数量分のすべてのインスタンスを含める
"""
    r = _call(client, display_bytes, prompt, max_tokens=4096)
    located: list[dict[str, Any]] = []
    for code, positions in r.items():
        if not isinstance(positions, list):
            continue
        for pos in positions:
            try:
                if isinstance(pos, (list, tuple)) and len(pos) >= 2:
                    located.append({"symbol_code": str(code), "x": float(pos[0]), "y": float(pos[1])})
                elif isinstance(pos, dict):
                    located.append({"symbol_code": str(code), "x": float(pos.get("x", 0)), "y": float(pos.get("y", 0))})
            except (TypeError, ValueError):
                pass
    logger.info("Locate: %d positions", len(located))
    return located


# ── 4パス検出コア ─────────────────────────────────────────────────────────────────

def _detect_multipass(
    client: anthropic.Anthropic,
    img_bytes: bytes,
) -> tuple[dict[str, int], list[dict[str, Any]], list[dict[str, Any]], str, int, int]:
    """
    4パス検出。
    戻り値: (merged_counts, uncertain_list, located_symbols, page_image_b64, display_w, display_h)
    ※ 全座標は display_bytes 座標系（max 1600px）
    """
    display_bytes, display_w, display_h = _get_display_bytes(img_bytes)
    logger.info("Display size: %dx%d", display_w, display_h)

    # Pass 1: 全体カウント
    r1 = _call(client, display_bytes, COUNT_PROMPT)
    c1 = _safe_counts(r1)
    logger.info("Pass1: %s", c1)

    # Pass 2: 再確認＋不確かな箇所
    r2 = _call(client, display_bytes, VERIFY_PROMPT)
    c2 = _safe_counts(r2)
    uncertain_raw: list[dict[str, Any]] = r2.get("uncertain", [])
    logger.info("Pass2: %s | uncertain=%d", c2, len(uncertain_raw))

    # Pass 3: タイル分割（大きい画像のみ）
    c3: dict[str, int] = defaultdict(int)
    if max(display_w, display_h) > TILE_THRESHOLD:
        tiles = _tile_image(display_bytes)
        logger.info("Pass3: %d tiles", len(tiles))
        for tile_bytes, x0, y0 in tiles:
            rt = _call(client, tile_bytes, TILE_PROMPT)
            ct = _safe_counts(rt)
            for code, n in ct.items():
                c3[code] += n
        logger.info("Pass3 tile sum: %s", dict(c3))

    # マージ: 全パスの最大値
    all_codes = set(c1) | set(c2) | set(c3)
    merged: dict[str, int] = {}
    for code in all_codes:
        v1 = c1.get(code, 0)
        v2 = c2.get(code, 0)
        v3 = c3.get(code, 0) if c3 else 0
        merged[code] = max(v1, v2, v3)
        if len({v for v in [v1, v2, v3] if v > 0}) > 1:
            logger.info("Disagree %s: p1=%d p2=%d p3=%d → %d", code, v1, v2, v3, merged[code])

    # Pass 4: 位置検出
    located = _locate_symbols(client, display_bytes, merged)

    # 不確かな箇所に uuid を付与
    uncertain = [
        {
            "id": str(uuid.uuid4()),
            "symbol_code": u.get("symbol_code", "UNKNOWN"),
            "x": float(u.get("x", 0)),
            "y": float(u.get("y", 0)),
            "reason": u.get("reason", ""),
        }
        for u in uncertain_raw
    ]

    page_b64 = base64.standard_b64encode(display_bytes).decode()
    return merged, uncertain, located, page_b64, display_w, display_h


# ── symbols 変換 ─────────────────────────────────────────────────────────────────

def _counts_to_symbols(counts: dict[str, int], confidence: float = 0.85) -> list[dict[str, Any]]:
    symbols: list[dict[str, Any]] = []
    for code, n in counts.items():
        label = LABELS.get(code, code)
        for _ in range(n):
            symbols.append({
                "symbol_code": code, "label": label,
                "confidence": confidence,
                "x": 0.0, "y": 0.0,
                "candidates": [{"symbol_code": code, "label": label, "score": confidence}],
            })
    return symbols


# ── 公開 API ─────────────────────────────────────────────────────────────────────

def detect_symbols_from_pdf(
    pdf_bytes: bytes, anthropic_api_key: str | None = None,
) -> tuple[list[dict[str, Any]], str | None, list[dict[str, Any]], list[dict[str, Any]], int, int]:
    """
    戻り値: (symbols, page_image_b64, uncertain_list, located_symbols, img_width, img_height)
    """
    client = anthropic.Anthropic(api_key=anthropic_api_key)
    pages = _pdf_to_images(pdf_bytes)
    logger.info("PDF %d pages", len(pages))

    all_symbols: list[dict[str, Any]] = []
    first_page_b64: str | None = None
    first_uncertain: list[dict[str, Any]] = []
    first_located: list[dict[str, Any]] = []
    first_w = first_h = 0

    for page_num, img_bytes in enumerate(pages[:10], start=1):
        counts, uncertain, located, page_b64, w, h = _detect_multipass(client, img_bytes)
        all_symbols.extend(_counts_to_symbols(counts))
        logger.info("Page %d: %d symbols, %d uncertain, %d located",
                    page_num, sum(counts.values()), len(uncertain), len(located))
        if page_num == 1:
            first_page_b64, first_uncertain, first_located, first_w, first_h = (
                page_b64, uncertain, located, w, h
            )

    return all_symbols, first_page_b64, first_uncertain, first_located, first_w, first_h


def detect_symbols_from_image(
    image_bytes: bytes, content_type: str, anthropic_api_key: str | None = None,
) -> tuple[list[dict[str, Any]], str | None, list[dict[str, Any]], list[dict[str, Any]], int, int]:
    client = anthropic.Anthropic(api_key=anthropic_api_key)
    counts, uncertain, located, page_b64, w, h = _detect_multipass(client, image_bytes)
    return _counts_to_symbols(counts), page_b64, uncertain, located, w, h


def detect_symbols_from_excel(
    excel_bytes: bytes, anthropic_api_key: str | None = None,
) -> tuple[list[dict[str, Any]], str | None, list[dict[str, Any]], list[dict[str, Any]], int, int]:
    client = anthropic.Anthropic(api_key=anthropic_api_key)
    pages = _excel_to_images(excel_bytes)
    if not pages:
        return [], None, [], [], 0, 0

    all_symbols: list[dict[str, Any]] = []
    first_b64: str | None = None
    first_uncertain: list[dict[str, Any]] = []
    first_located: list[dict[str, Any]] = []
    first_w = first_h = 0

    for i, img_bytes in enumerate(pages):
        counts, uncertain, located, page_b64, w, h = _detect_multipass(client, img_bytes)
        all_symbols.extend(_counts_to_symbols(counts))
        if i == 0:
            first_b64, first_uncertain, first_located, first_w, first_h = (
                page_b64, uncertain, located, w, h
            )

    return all_symbols, first_b64, first_uncertain, first_located, first_w, first_h


def symbols_to_symbol_hit_rows(
    symbols: list[dict[str, Any]],
    job_id: str,
    revision_id: str | None = None,
) -> list[dict[str, Any]]:
    rows = []
    for sym in symbols:
        code = sym.get("symbol_code", "UNKNOWN")
        conf = float(sym.get("confidence", 0.5))
        # AiCandidate スキーマ（camelCase）に合わせたフォーマット
        candidates = [{
            "symbolCode": code,
            "label": sym.get("label", LABELS.get(code, code)),
            "confidence": conf,
        }]
        rows.append({
            "id": str(uuid.uuid4()),
            "job_id": job_id,
            "revision_id": revision_id,
            "symbol_code": code,
            "label": sym.get("label", LABELS.get(code, code)),
            "ai_confidence": conf,
            "ai_candidates": candidates,
            "x": float(sym.get("x", 0)),
            "y": float(sym.get("y", 0)),
            "status": "UNASSIGNED",
        })
    return rows
