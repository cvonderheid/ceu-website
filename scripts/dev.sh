#!/usr/bin/env bash
set -euo pipefail

DB_PORT="${DB_PORT:-5432}"
DEFAULT_DATABASE_URL="postgresql+psycopg://ce_user:ce_pass@localhost:${DB_PORT}/ce_tracker"
API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-5173}"

export DATABASE_URL="${DATABASE_URL:-$DEFAULT_DATABASE_URL}"
: "${DEV_USER_ID:=dev-user-1}"
: "${DEV_EMAIL:=dev@example.com}"
export DEV_USER_ID DEV_EMAIL DB_PORT

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
./scripts/wait_for_db.sh

echo "DATABASE_URL=${DATABASE_URL}"
echo "DEV_USER_ID=${DEV_USER_ID}"
echo "DB_PORT=${DB_PORT}"
echo "API_PORT=${API_PORT}"
echo "WEB_PORT=${WEB_PORT}"

check_port() {
  local port="$1"
  python - <<PY
import socket, sys
port = int("$port")
sock = socket.socket()
try:
    sock.bind(("127.0.0.1", port))
except OSError:
    sys.exit(1)
finally:
    sock.close()
PY
}

if ! check_port "$API_PORT"; then
  echo "Port ${API_PORT} is already in use. Stop the existing service or set API_PORT."
  exit 1
fi

if ! check_port "$WEB_PORT"; then
  echo "Port ${WEB_PORT} is already in use. Stop the existing service or set WEB_PORT."
  exit 1
fi

echo "Running migrations..."
(
  cd apps/api
  uv run alembic upgrade head
)

echo "Starting API on http://127.0.0.1:${API_PORT}"
(
  cd apps/api
  uv run uvicorn ce_api.main:app --reload --host 127.0.0.1 --port "$API_PORT" --log-level warning
) &
API_PID=$!

echo "Starting Web on http://127.0.0.1:${WEB_PORT}"
(
  cd apps/web
  npm run dev -- --host 127.0.0.1 --port "$WEB_PORT" --strictPort
) &
WEB_PID=$!

echo "Ready: API http://127.0.0.1:${API_PORT} | Web http://127.0.0.1:${WEB_PORT}"

wait "$API_PID" "$WEB_PID"
