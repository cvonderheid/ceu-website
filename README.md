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
- DB_PORT defaults to `5432` (set `DB_PORT=55432` if `5432` is already in use)
- DEV_USER_ID defaults to `dev-user-1`
- DEV_EMAIL defaults to `dev@example.com`

Override any of these env vars as needed.

## Deployment auth and storage env

For AWS deployment with Cognito and S3-backed certificates, configure:

- API runtime:
  - `COGNITO_REGION`
  - `COGNITO_USER_POOL_ID`
  - `COGNITO_USER_POOL_CLIENT_ID`
  - `CERT_STORAGE_BUCKET`
  - optional `CERT_STORAGE_PREFIX`
  - `DATABASE_URL`
- Web build/runtime:
  - `VITE_COGNITO_DOMAIN` (e.g. `auth.example.com`)
  - `VITE_COGNITO_CLIENT_ID`
  - optional `VITE_COGNITO_REDIRECT_URI` (defaults to `<origin>/auth/callback`)
  - optional `VITE_COGNITO_LOGOUT_URI` (defaults to `<origin>`)
  - optional `VITE_COGNITO_SCOPE` (defaults to `openid email profile`)

Notes:
- API enforces Cognito bearer tokens when Cognito env vars are set.
- Without Cognito env vars, API keeps local/dev header-based auth behavior for tests and local dev.

## Demo data

Seed the app with demo data (states, cycles, courses, allocations, certificates):

```bash
make demo
```

Reset and re-seed:

```bash
make demo-reset
```

Seed demo data then start dev servers:

```bash
make demo-dev
```

Defaults:
- user id: demo-user-1
- email: demo@example.com

Demo UI note:
- `make demo-dev` forces `DEV_USER_ID=demo-user-1` so the seeded data shows immediately.

## Demo checks

Seed demo data and run a quick API invariant check:

```bash
make demo-check
```
