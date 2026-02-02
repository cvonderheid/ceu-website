# CE Tracker

## Quick start

Run everything (db + migrations + api + web):

```bash
./scripts/dev.sh
```

Run tests (db + migrations + api tests + web build):

```bash
./scripts/test.sh
```

Optional Makefile helpers:

```bash
make dev
make test
make migrate
make db-up
make db-down
```

## Defaults

- DATABASE_URL defaults to `postgresql+psycopg://ce_user:ce_pass@localhost:5432/ce_tracker`
- DEV_USER_ID defaults to `dev-user-1`
- DEV_EMAIL defaults to `dev@example.com`

Override any of these env vars as needed.
