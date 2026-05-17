# 自動化リスト — Electrical Symbol Inspector OS

> Claude Code によるコードベース分析をもとに作成（2026-05-17）

---

## 優先度：高 🔴

### 1. CI/CD パイプライン（GitHub Actions）

**対象ファイル**: `.github/workflows/ci.yml`（新規作成）

| ステップ | 内容 |
|----------|------|
| frontend-check | `tsc --noEmit` + `eslint` をPRごとに自動実行 |
| backend-check | `ruff check` + `pytest` をPRごとに自動実行 |
| docker-build | `docker build` が通るか検証 |
| deploy | `main` へのマージで Render 自動デプロイ（render.yaml が既存） |

**なぜ今**: TypeScript と Python のコードに型エラー・Lintエラーが混入しやすい状態。手動レビューだけでは見落としが出る。

---

### 2. 高信頼度シンボルの自動承認

**対象ファイル**: `backend/app/routers/drawings.py` + `drawing_service.py`

図面アップロード完了時、`ai_confidence >= 0.95` のシンボルヒットを自動的に `ACCEPTED` ステータスにする。

```python
# drawings.py の upload_drawing 内に追加
AUTO_ACCEPT_THRESHOLD = 0.95

for obj in hit_objects:
    if obj.ai_confidence >= AUTO_ACCEPT_THRESHOLD:
        obj.status = "ACCEPTED"
    db.add(obj)
```

**効果**: 高精度案件では手動レビュー件数を大幅削減。閾値は設定値として環境変数化推奨。

---

### 3. 単価マスター期限切れアラート

**対象ファイル**: `backend/app/services/`（新規 `alert_service.py`）

`MasterItem.valid_until` が30日以内に切れるレコードを毎朝チェックし、ログ出力（将来的にはメール/Slack通知）。

```python
# APScheduler または Celery Beat で定期実行
async def check_expiring_master_items(db: AsyncSession):
    threshold = date.today() + timedelta(days=30)
    expiring = await db.execute(
        select(MasterItem).where(
            MasterItem.valid_until != None,
            MasterItem.valid_until <= threshold,
        )
    )
    for item in expiring.scalars():
        logger.warning(f"単価マスター期限切れ間近: {item.symbol_code} ({item.valid_until})")
```

**なぜ今**: `estimation_service.py` で `valid_until` を参照しているため、期限切れが起きると見積金額が `0円` の PENDING だらけになる。

---

## 優先度：中 🟡

### 4. シードデータの自動投入

**対象ファイル**: `backend/seed_master_items.py`（既存）、`backend/app/main.py`

`lifespan` 内で `seed_master_items.py` を実行し、マスターデータが0件のときのみ自動投入する。

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    run_migrations()
    await seed_if_empty()   # ← 追加
    yield
```

**効果**: 新環境構築時の手作業を排除。

---

### 5. 見積生成の自動トリガー

**対象ファイル**: `backend/app/routers/symbol_hits.py`

シンボルヒットのステータスを一括更新した際、全件が `ACCEPTED` or `REJECTED` になったタイミングで自動的に `generate_estimation` を呼び出す。

**効果**: 「承認後に見積生成ボタンを押す」という手順を1ステップ削減。

---

### 6. PostgreSQL 定期バックアップ

**対象ファイル**: `docker-compose.yml` または Render のジョブ設定

```bash
# cronジョブ例（毎日3時）
0 3 * * * pg_dump $DATABASE_URL | gzip > /backups/db_$(date +%Y%m%d).sql.gz
# 30日以上前のバックアップを削除
find /backups -name "*.sql.gz" -mtime +30 -delete
```

**なぜ今**: `pgdata` ボリュームはコンテナ削除で消える。Render の Postgres は有料プランでバックアップ有効化が必要。

---

### 7. Claude API コスト追跡

**対象ファイル**: `backend/app/services/drawing_service.py`

`_call_claude_vision` の呼び出しごとに入力・出力トークン数をログに記録し、月次コストを試算する。

```python
usage = message.usage
logger.info(
    f"Claude API usage | page={page_num} "
    f"input={usage.input_tokens} output={usage.output_tokens}"
)
```

**効果**: `claude-opus-4-7` は高コストモデルのため、月次利用費の予測が立てられる。

---

### 8. バッチ図面処理エンドポイント

**対象ファイル**: `backend/app/routers/drawings.py`（新規エンドポイント追加）

複数ファイルを1リクエストで受け付け、BackgroundTasks でキュー処理する。

```python
@router.post("/{job_id}/drawings/batch-upload")
async def batch_upload_drawing(
    job_id: str,
    files: list[UploadFile] = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: AsyncSession = Depends(get_db),
):
    for file in files:
        background_tasks.add_task(process_drawing, job_id, file, db)
    return {"queued": len(files)}
```

---

## 優先度：低 🟢

### 9. 古いジョブのアーカイブ

90日以上前かつ `status = "COMPLETED"` のジョブを定期的に論理削除（`status = "ARCHIVED"`）。

### 10. 記号検出精度モニタリング

SymbolHit の `ai_confidence` 分布を `/admin/stats` エンドポイントで集計・可視化。検出精度の劣化を早期発見する。

### 11. Export の自動スケジューリング

指定日時に見積 Excel/PDF を自動生成してストレージに保存し、ダウンロードURLをジョブに紐付ける。

### 12. フロントエンドの Storybook 導入

`ConfidenceBar`、`StatusBadge` などの UI コンポーネントをカタログ化し、デザインの一貫性を自動チェック。

---

## 実装順序の推奨

```
Week 1: #1 CI/CD → #2 高信頼度自動承認 → #7 APIコスト追跡
Week 2: #3 期限切れアラート → #4 シードデータ自動投入 → #6 バックアップ
Week 3: #5 見積生成自動トリガー → #8 バッチ処理
以降:   #9〜#12（余裕があれば）
```

---

## 実装時の共通注意事項

- 閾値・スケジュール間隔はすべて **環境変数** で上書き可能にする（`backend/app/config.py` の `Settings` に追加）
- `BackgroundTasks` を使う場合は DB セッションのライフサイクルに注意（`get_db` を直接渡さず、新しいセッションを生成する）
- Claude API キーは `ANTHROPIC_API_KEY` 環境変数から取得する現行方式を維持する
