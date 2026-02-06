#!/usr/bin/env bash
set -euo pipefail

DB_PORT="${DB_PORT:-5432}"
DEFAULT_DATABASE_URL="postgresql+psycopg://ce_user:ce_pass@localhost:${DB_PORT}/ce_tracker"

export DATABASE_URL="${DATABASE_URL:-$DEFAULT_DATABASE_URL}"
export DEV_USER_ID="${DEV_USER_ID:-dev-user-1}"
export DEV_EMAIL="${DEV_EMAIL:-dev@example.com}"
export DB_PORT

echo "Starting Postgres..."
docker compose up -d db
./scripts/wait_for_db.sh

echo "Running migrations..."
(
  cd apps/api
  uv run alembic upgrade head
)

echo "Running API tests..."
(
  cd apps/api
  uv run pytest
)

echo "Building Web..."
(
  cd apps/web
  npm run build
)
