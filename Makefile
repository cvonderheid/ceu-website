.PHONY: dev test migrate db-up db-down demo demo-reset demo-dev

DATABASE_URL ?= postgresql+psycopg://ce_user:ce_pass@localhost:5432/ce_tracker
DEV_USER_ID ?= dev-user-1
DEV_EMAIL ?= dev@example.com

export DATABASE_URL DEV_USER_ID DEV_EMAIL

dev:
	./scripts/dev.sh

test:
	./scripts/test.sh

migrate:
	cd apps/api && uv run alembic upgrade head

db-up:
	docker compose up -d db

db-down:
	docker compose down

demo:
	docker compose up -d db
	./scripts/wait_for_db.sh
	cd apps/api && uv run alembic upgrade head
	cd apps/api && CERT_STORAGE_DIR=apps/api/.data/certificates uv run python -m ce_api.scripts.seed_demo --reset

demo-reset: demo

demo-dev:
	-docker compose down -v
	$(MAKE) demo
	DEV_USER_ID=demo-user-1 DEV_EMAIL=demo@example.com ./scripts/dev.sh

demo-check: demo
	cd apps/api && uv run python -m ce_api.scripts.demo_check
