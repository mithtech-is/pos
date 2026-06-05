# CounterFlow POS

Offline-first standalone POS stack with a Medusa.js backend, Electron desktop
terminal, and Expo mobile terminal. Orders are written locally first, queued for
sync, and pushed to the backend when connectivity returns.

## Architecture

```
Medusa backend + PostgreSQL        POS terminals
--------------------------        -----------------------------
/pos/* sync APIs            <-->  Electron + React desktop app
Custom POS modules          <-->  Expo / React Native mobile app
Admin dashboard                   SQLite local cache + sync queue
```

## Monorepo layout

```
apps/
  backend/        Medusa.js v2 backend and /pos/* sync APIs
  pos-app/        Electron desktop POS terminal
  mobile-pos/     Expo / React Native POS terminal
packages/
  shared/         Shared types and sync helpers
```

## Key features

- Offline-first checkout with local order numbers and idempotent sync.
- Product catalog, barcode scanning, cart, discounts, receipts, and returns.
- Pending sync, conflict, transaction, cash closing, and audit views.
- UPI QR support and configurable business/payment settings.
- Light/dark theme, with the primary brand kept monochrome.

## Docker Backend

```bash
npm run docker:up          # start PostgreSQL + Medusa backend
npm run docker:seed        # seed base data and dev users
npm run docker:logs        # tail backend logs
npm run docker:down        # stop containers
npm run docker:reset-data  # stop containers and remove the backend DB volume
```

Backend URL: `http://localhost:9000`

Postgres is exposed on host port `5433` and uses the `counterflow_pos`
database inside Docker.

## Desktop App

```bash
npm run pos:dev
```

For the Electron window:

```bash
npm --workspace apps/pos-app run dev:electron
```

## Dev Logins

| Role | Email | Password |
| --- | --- | --- |
| Cashier | `cashier@pos.local` | `cashier12345` |
| Manager | `manager@pos.local` | `manager12345` |

Manager PIN for discount and return approvals: `9999`.
