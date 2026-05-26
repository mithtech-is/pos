# Architecture

This document is the engineering-side companion to the spec
(`offline_first_school_uniform_pos_full_build_plan.md`, sections 2 and 27).

## Components

```
┌──────────────────────────────────────────────────┐
│ Medusa.js v2 backend (apps/backend)              │
│                                                  │
│  Built-in modules: product, inventory, order,    │
│    payment, customer, stock-location, sales-channel
│                                                  │
│  Custom modules (src/modules):                   │
│    school          uniform-kit    pos-device     │
│    offline-sync    audit-log      student        │
│    receipt                                       │
│                                                  │
│  API routes (src/api):                           │
│    /pos/auth/*         /pos/device/*             │
│    /pos/sync/*         /pos/orders /returns      │
│    /admin/sync-conflicts/*                       │
│    /admin/reports/*                              │
│                                                  │
│  Workflows (src/workflows):                      │
│    create-pos-order, sync-offline-order,         │
│    resolve-sync-conflict, register-pos-device,   │
│    create-return, stock-adjustment, cash-closing │
└─────────────────────┬────────────────────────────┘
                      │ HTTPS (JSON)
                      ▼
┌──────────────────────────────────────────────────┐
│ Electron POS (apps/pos-app)                      │
│                                                  │
│  Main process:                                   │
│    db/            better-sqlite3 + repositories  │
│    sync-worker    Periodic pull + push           │
│    printer        Receipt rendering / printing   │
│                                                  │
│  Preload bridge: contextBridge → window.pos      │
│                                                  │
│  Renderer (React):                               │
│    LoginPage, POSPage, OrdersPage,               │
│    PendingOrdersPage, SyncPage, ConflictsPage,   │
│    SettingsPage                                  │
└──────────────────────────────────────────────────┘
```

## Trust boundary

- The renderer is sandboxed (`contextIsolation: true, nodeIntegration: false`).
- All disk + network operations live in the main process and are exposed via
  `contextBridge` as `window.pos.*`.
- The renderer never sees the backend URL or device token in clear unless
  the user opens the Settings screen.

## Offline-first invariants

1. **Completing a sale never touches the network** — implemented in
   `apps/pos-app/src/renderer/pages/POSPage.tsx#completeSale`.
2. **Idempotency** — every offline order has a key of the form
   `device_id + ":" + local_order_id`. The backend's `sync_events.idempotency_key`
   column is `UNIQUE`. Retrying a push returns the existing `server_order_id`
   rather than creating a new one (see `sync/push/route.ts`).
3. **Local stock is authoritative for billing decisions** — `local_available
   = last_synced - unsynced_sales + unsynced_returns + unsynced_adjustments`.
   The backend reconciles centrally during `sync-offline-order-workflow`.
4. **Pull is best-effort** — if pull sync fails, the POS keeps using the
   stale snapshot. The badge in the topbar advertises this state.

## Module ownership map

| Concern | Owner module | Wire |
| --- | --- | --- |
| Schools, classes, academic years | `school` | Custom |
| Uniform kits & class/gender rules | `uniform-kit` | Custom |
| POS device registration & blocking | `pos-device` | Custom |
| Offline sync batches/events/conflicts | `offline-sync` | Custom |
| Audit trail | `audit-log` | Custom |
| Student profiles | `student` | Custom |
| Receipt prints | `receipt` | Custom |
| Products & variants & prices | `@medusajs/product` | Built-in |
| Inventory, stock locations | `@medusajs/inventory`, `@medusajs/stock-location` | Built-in |
| Sales channels | `@medusajs/sales-channel` | Built-in |
| Orders & line items | `@medusajs/order` | Built-in |
| Payments | `@medusajs/payment` | Built-in |
