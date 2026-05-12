#!/bin/sh
set -e

echo "=== Starting electrical-symbol-inspector API ==="
echo "DATABASE_URL is set: $([ -n "$DATABASE_URL" ] && echo yes || echo no)"

echo "Running database migrations..."
alembic upgrade head
echo "Migrations completed."

echo "Starting application..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
