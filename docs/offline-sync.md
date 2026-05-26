# Offline Sync

How offline-originated events make their way to the central backend, and how
conflicts are surfaced. Source of truth: build plan sections 9.2, 9.3, 10.2,
10.3, 14.1–14.5, and 15.

## Data flow

```
POS UI ──(Complete Sale)──▶ local_orders, local_order_items
                          │
                          ├──▶ local_inventory_snapshot.unsynced_sales++
                          │
                          └──▶ local_sync_queue (status=pending, idempotency_key)

Sync worker (every 30s):
   pull /pos/sync/pull    ─▶ refresh master data + inventory snapshot
   push /pos/sync/push    ─▶ batch of queued events
                            └─▶ backend runs sync-offline-order-workflow
                                  → sync_event row in PG
                                  → order created (or conflict raised)
                            ◀── per-event result
   apply results          ─▶ queue: synced / failed / conflict
                          ─▶ local_orders.sync_status mirrors result
```

## Idempotency contract

Every event in the push payload carries an `idempotency_key`:

```
{device_id}:{local_order_number}     # e.g. POS001:POS001-20260518-0001
```

The backend uses a `UNIQUE` index on `sync_events.idempotency_key`. The push
handler short-circuits before workflow execution if it finds an existing
synced event with the same key — it returns the existing `server_order_id` so
the POS treats the result as a no-op success.

## Sync statuses

| Status | Meaning |
| --- | --- |
| `pending` | Queued locally, never sent |
| `syncing` | Currently in flight |
| `synced` | Backend acknowledged + assigned a server ref |
| `failed` | Network/validation error; eligible for retry |
| `conflict` | Backend raised a SyncConflict; needs admin action |

Retry policy: an event with `retry_count >= SYNC_MAX_RETRIES` (5) is no
longer picked up by the worker and surfaces in the Pending screen so the
user knows to involve admin.

## Conflict types

| Type | Severity | What happens |
| --- | --- | --- |
| `duplicate_order` | low | Returns existing server reference (handled silently) |
| `stock_conflict` | high | Sale stays valid locally; admin chooses approve/transfer/adjust |
| `product_inactive` | medium | Existing print is honored; future sales blocked after next pull |
| `price_changed` | low | Honor POS price; flag in report |
| `tax_mismatch` | medium | Honor POS tax; flag in report |
| `invalid_cashier` | critical | Sync succeeds with security warning; cashier blocked next pull |
| `invalid_device` | critical | Stop sync, lock POS, require admin reset |
| `invalid_school_mapping` | medium | Order accepted; flag in audit |

The admin resolves via `POST /admin/sync-conflicts/:id/resolve` with one of
`approve | reject | transfer_stock | adjust_stock`.

## Detecting connectivity

We probe `GET {backend}/health` with a short timeout each tick. If the call
fails we mark the worker as offline and skip the rest of the tick. The
renderer reads this state via `window.pos.syncState()` and renders the
`SyncStatusBadge` accordingly.

## Manual operations

- **Force a sync** — Sync screen → "Sync now", or programmatically
  `window.pos.syncTick()`.
- **Pause sync** — Sync screen → "Pause"; e.g. during inventory work where
  partial syncs would be confusing.
- **Inspect queue** — `window.pos.queueStats()` returns counts by status.
