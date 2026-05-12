#!/bin/sh

echo "=== Starting electrical-symbol-inspector API ==="
echo "Python version: $(python --version)"
echo "DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo YES || echo NO)"
echo "PORT: ${PORT:-8000}"

echo ""
echo "--- Running database migrations ---"
alembic upgrade head
MIGRATION_EXIT=$?
if [ $MIGRATION_EXIT -ne 0 ]; then
    echo "WARNING: Migration failed with exit code $MIGRATION_EXIT"
    echo "Continuing startup anyway..."
fi

echo ""
echo "--- Starting uvicorn ---"
PORT="${PORT:-8000}"
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
