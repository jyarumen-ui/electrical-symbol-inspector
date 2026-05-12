#!/bin/sh
echo "=== Starting electrical-symbol-inspector API ==="
echo "Python: $(python --version)"
PORT="${PORT:-8000}"
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
