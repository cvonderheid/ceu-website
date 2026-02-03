#!/usr/bin/env bash
set -euo pipefail

MAX_WAIT_SECONDS="${DB_WAIT_SECONDS:-30}"
POSTGRES_USER="${POSTGRES_USER:-ce_user}"
POSTGRES_DB="${POSTGRES_DB:-ce_tracker}"

for i in $(seq 1 "$MAX_WAIT_SECONDS"); do
  if docker compose exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
    echo "Postgres is ready"
    exit 0
  fi
  sleep 1
  echo "Waiting for Postgres ($i/$MAX_WAIT_SECONDS)..."
done

echo "Postgres did not become ready in time" >&2
exit 1
