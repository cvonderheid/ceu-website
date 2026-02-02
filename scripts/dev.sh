#!/usr/bin/env bash
set -euo pipefail

DEFAULT_DATABASE_URL="postgresql+psycopg://ce_user:ce_pass@localhost:5432/ce_tracker"

export DATABASE_URL="${DATABASE_URL:-$DEFAULT_DATABASE_URL}"
export DEV_USER_ID="${DEV_USER_ID:-dev-user-1}"
export DEV_EMAIL="${DEV_EMAIL:-dev@example.com}"

cleanup() {
  if [[ -n "${API_PID:-}" ]]; then
    kill "$API_PID" 2>/dev/null || true
  fi
  if [[ -n "${WEB_PID:-}" ]]; then
    kill "$WEB_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "Starting Postgres..."
docker compose up -d db

echo "Running migrations..."
(
  cd apps/api
  uv run alembic upgrade head
)

echo "Starting API on http://127.0.0.1:8000"
(
  cd apps/api
  uv run uvicorn ce_api.main:app --reload --host 127.0.0.1 --port 8000 --log-level warning
) &
API_PID=$!

echo "Starting Web on http://127.0.0.1:5173"
(
  cd apps/web
  npm run dev -- --host 127.0.0.1 --port 5173
) &
WEB_PID=$!

echo "Ready: API http://127.0.0.1:8000 | Web http://127.0.0.1:5173"

wait "$API_PID" "$WEB_PID"
