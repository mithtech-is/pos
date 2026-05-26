# Polemarch POS

Offline-first point-of-sale terminal for **Polemarch.in** — an unlisted-shares
dealer. Dealers book buy/sell trades from a desktop terminal or a phone, even
when the network drops. Every trade queues locally and syncs to compliance
when connectivity returns.

> Originally built as a school-uniform POS and pivoted to unlisted equities.
> Some legacy module names (e.g. `school`, `uniform-kit`) still appear under
> the hood — they're reused as `issuer` / `lot` placeholders so the schema
> stays compatible with the existing sync protocol.

## Architecture

```
Cloud backend                          Dealer terminal
─────────────                          ──────────────────
Medusa.js v2                           Electron + React  (desk)
  ├─ PostgreSQL          ◄──sync──►    Expo + React Native (field)
  ├─ Custom modules                      ├─ SQLite local DB
  ├─ /pos/* sync APIs                    ├─ Sync queue (push, idempotent)
  └─ Admin dashboard                     ├─ Master data snapshot (pull)
                                         ├─ Local trade numbers
                                         ├─ Contract-note PDF rendering
                                         └─ Barcode (ISIN) scanner UI
```

## Monorepo layout

```
apps/
  backend/        Medusa.js v2 backend (custom modules, /pos/* sync APIs)
  pos-app/        Electron desktop dealer terminal
  mobile-pos/     Expo / React Native mobile dealer app
packages/
  shared/         Types + sync helpers shared by all three clients
```

## Key features

- **Offline-first trades** — every trade writes to SQLite first, queues for
  sync with an idempotency key, never blocks on the network. Reconnect →
  auto-sync via NetInfo / AppState listeners.
- **Offline Trades audit page** — compliance officer's dedicated view of every
  trade booked while disconnected, with sync-state pills and CSV export.
- **Scrip catalog (Listings)** — image-grid of unlisted companies (ISIN as
  SKU/barcode). Detail modal with quantity picker, drops into Trade Ticket.
- **Trade Ticket (Cart)** — swipe-to-delete line items, promotion / discount
  dialog, compliance-PIN gate for price deviations > 10%.
- **Settlement modes** — UPI (BHIM QR), NEFT/RTGS, cheque, cash.
- **Contract notes** — Print or share-as-PDF directly from any trade row.
- **Light/dark themes** — Agilo-inspired light by default, dark mode opt-in.

## Domain mapping (legacy → current)

| Legacy uniform concept | Polemarch concept            |
| ---------------------- | ---------------------------- |
| School                 | Issuer                        |
| Product                | Scrip listing                 |
| Variant                | Lot (typically 1 share)       |
| SKU / barcode          | ISIN                          |
| Cashier                | Dealer                        |
| Manager                | Compliance Officer            |
| Bill / Order           | Trade                         |
| Cart                   | Trade Ticket                  |
| Return                 | Reversal                      |
| Bulk order             | Bulk trade upload             |
| Cash closing           | End-of-day reconciliation     |
| Distributor branding   | Broker identity (SEBI Reg #)  |

## Running locally

```bash
# 1. PostgreSQL (assumes Docker / local install)
#    DATABASE_URL=postgres://postgres:<pwd>@localhost:5432/school_uniform_pos

# 2. Backend
cd apps/backend
npm install
cp .env.example .env   # fill in DATABASE_URL etc.
npx medusa db:migrate
npx medusa exec ./src/scripts/seed.ts             # base infra
npx medusa exec ./src/scripts/seed-polemarch.ts   # 15 scrips
npm run dev    # serves on :9000

# 3. Electron desktop terminal
cd apps/pos-app
npm install
npm run dev               # Vite renderer
npx electron .            # window

# 4. Mobile dealer app (Expo)
cd apps/mobile-pos
npm install
npx expo start --lan      # scan QR with Expo Go
```

Default logins (dev seed):

| Role               | Email                | Password        |
| ------------------ | -------------------- | --------------- |
| Dealer             | `cashier@pos.local`  | `cashier12345`  |
| Compliance Officer | `manager@pos.local`  | `manager12345`  |
| Medusa admin       | `admin@admin.com`    | `admin123`      |

Compliance PIN for price-deviation / reversal approvals: `9999`

## License

Proprietary — Polemarch / mithtech-is.
