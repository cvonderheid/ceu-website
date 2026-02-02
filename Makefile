.PHONY: dev test migrate db-up db-down

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
