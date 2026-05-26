# Backend Setup

## 1. Install dependencies

```sh
npm install
```

This installs all workspace dependencies including the Medusa CLI used by the
backend scripts.

## 2. Provision PostgreSQL and Redis

For local development:

```sh
docker run --name pos-postgres -e POSTGRES_PASSWORD=medusa \
  -e POSTGRES_USER=medusa -e POSTGRES_DB=school_uniform_pos \
  -p 5432:5432 -d postgres:16

docker run --name pos-redis -p 6379:6379 -d redis:7
```

## 3. Environment

```sh
cp apps/backend/.env.example apps/backend/.env
```

Edit `apps/backend/.env`. The minimum values needed for `npm run backend:dev`
to boot are `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `COOKIE_SECRET`.

## 4. Migrations

```sh
npm --workspace apps/backend run migration:run
```

This runs both Medusa's built-in module migrations and any custom-module
migrations under `src/modules/*/migrations/`.

If you change a custom module's model, regenerate the migration:

```sh
npm --workspace apps/backend run migration:generate
```

## 5. Seed

```sh
npm --workspace apps/backend run seed
```

Creates the `2026-2027` academic year, two demo schools, classes 1–8 per
school, and registers `POS001` so the POS app can log in immediately.

## 6. Run

```sh
npm run backend:dev
```

Medusa boots on `http://localhost:9000` (admin) and exposes the POS API under
`/pos/*` and the admin reports under `/admin/reports/*`.

## Manual smoke test

```sh
# register POS device manually
curl -X POST http://localhost:9000/pos/device/register \
  -H 'Content-Type: application/json' \
  -d '{"device_code":"POS002","device_name":"Camp counter","registered_by":"admin"}'

# pull master data
curl -X POST http://localhost:9000/pos/sync/pull \
  -H 'Content-Type: application/json' \
  -d '{"device_id":"POS001"}'
```
