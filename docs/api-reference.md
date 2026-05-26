# API Reference

All routes live under `apps/backend/src/api/`. They follow the Medusa v2
file-based router: each `route.ts` exports verb handlers (`GET`, `POST`, ...).

Response envelope:

```jsonc
// Success
{ "success": true, "data": { ... } }
// Error
{ "success": false, "error": { "code": "bad_request", "message": "..." } }
```

## POS-facing (`/pos/*`)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/pos/auth/login` | Email/password + device code → access token + user record |
| POST | `/pos/auth/refresh` | Refresh access token |
| POST | `/pos/auth/logout` | Revoke token |
| POST | `/pos/device/register` | Create or upsert a POS device, mint registration token |
| POST | `/pos/device/heartbeat` | Update `last_sync_at`, report app version / queue stats |
| POST | `/pos/sync/pull` | Master-data snapshot (incremental if `last_sync_at` is provided) |
| POST | `/pos/sync/push` | Batched offline events → backend |
| GET | `/pos/sync/status/:device_id` | Pending events and open conflicts for a device |
| GET | `/pos/barcode/:barcode` | Look up product variant by barcode/SKU (online fallback) |
| POST | `/pos/orders` | Online order — uses the same workflow as offline-then-synced orders |
| GET | `/pos/orders/:id` | Retrieve order by id |
| POST | `/pos/returns` | Create a return (requires `manager_pin_verified=true`) |

### `POST /pos/sync/push`

```jsonc
// Request
{
  "device_id": "POS001",
  "batch_id": "batch_20260518_001",
  "events": [
    {
      "event_type": "order.created",
      "idempotency_key": "POS001:POS001-20260518-0001",
      "payload": { /* OrderInput */ }
    }
  ]
}
```

```jsonc
// Response
{
  "success": true,
  "data": {
    "batch_id": "batch_20260518_001",
    "results": [
      {
        "idempotency_key": "POS001:POS001-20260518-0001",
        "status": "synced",          // synced | duplicate | conflict | failed
        "server_order_id": "ord_123" // present on synced/duplicate
      }
    ]
  }
}
```

### `POST /pos/sync/pull`

```jsonc
// Request
{ "device_id": "POS001", "last_sync_at": "2026-05-18T10:00:00Z" }
```

```jsonc
// Response data
{
  "server_time": "2026-05-18T10:05:12Z",
  "schools": [], "classes": [], "academic_years": [],
  "products": [], "variants": [],
  "kits": [], "kit_items": [], "uniform_rules": [],
  "inventory_snapshot": [],
  "users": [], "settings": { /* ... */ },
  "blocked_devices": []
}
```

## Admin (`/admin/*`)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/admin/sync-conflicts` | List open conflicts (filterable) |
| POST | `/admin/sync-conflicts/:id/resolve` | Apply resolution: `approve`/`reject`/`transfer_stock`/`adjust_stock` |
| POST | `/admin/sync-conflicts/:id/reject` | Reject conflict outright |

### Reports

All reports follow the same pattern: `GET /admin/reports/<name>` and accept
common filters via query params (`date_from`, `date_to`, plus report-specific
keys). Response shape: `{ items: [...], count: number }`.

| Path | Description |
| --- | --- |
| `/admin/reports/sales` | Daily totals across all counters |
| `/admin/reports/school-sales` | Aggregated by school |
| `/admin/reports/class-sales` | Aggregated by (school, class, gender, uniform_type) |
| `/admin/reports/product-sales` | Aggregated by variant |
| `/admin/reports/size-sales` | Aggregated by size |
| `/admin/reports/inventory` | Current stock levels |
| `/admin/reports/low-stock` | Variants below configurable threshold (`?threshold=5`) |
| `/admin/reports/offline-pending-orders` | Events stuck in pending/failed |
| `/admin/reports/sync-conflicts` | Open conflicts |
| `/admin/reports/payment-summary` | Totals by payment mode |
| `/admin/reports/cashier-sales` | Cashier-level breakdown |
| `/admin/reports/device-sales` | Per-device sync health summary |
| `/admin/reports/returns` | Returns ledger |
| `/admin/reports/discounts` | Orders with non-zero discount |
| `/admin/reports/audit-logs` | Audit trail (filterable) |
| `/admin/reports/cash-closing` | Cashier end-of-day closings |
| `/admin/reports/stock-transfers` | Stock-transfer movements |

## Headers

POS-originated requests should include:

```
x-pos-device-code:  <device_code>
x-pos-device-token: <registration_token>
Authorization:      Bearer <access_token>
```

The middleware in `apps/backend/src/api/middlewares.ts` extracts these and
makes them available to downstream handlers as `req.pos_device_code` and
`req.pos_device_token`.
