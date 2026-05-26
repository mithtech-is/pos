# Testing Guide

The build plan calls for backend, POS-offline, security, and hardware tests
(spec section 23). The MVP test layer is intentionally minimal — the goal is
to make the critical offline flows verifiable.

## Backend (Vitest, in `apps/backend`)

Add unit tests under `apps/backend/src/__tests__/`. Focus areas:

- `sync-offline-order-workflow` should be idempotent when called with the
  same `idempotency_key` (no duplicate order, returns same `server_order_id`).
- `OfflineSyncModuleService.findByIdempotencyKey` correctly resolves prior
  synced events.
- `PosDeviceModuleService.authorizeDevice` rejects blocked / unknown devices.

Run with `npm --workspace apps/backend run test:unit`.

## POS app (Vitest + Electron)

Add tests under `apps/pos-app/src/__tests__/`. Focus areas:

- `OrdersRepository.allocateLocalOrderNumber` produces sequential, unique
  numbers per `(device_code, date)`.
- `buildIdempotencyKey` returns `device_id:local_order_number` exactly.
- `InventoryRepository.applySale` reduces available stock; `acknowledgeSale`
  reconciles to `last_synced_quantity`.

Run with `npm --workspace apps/pos-app run test`.

## End-to-end (manual)

1. **Online billing**:
   - Start backend + POS, log in online.
   - Complete a sale.
   - Verify the order appears under Orders with status `synced` and a
     `server_order_id`.

2. **Offline billing**:
   - Stop the backend.
   - Complete a sale; receipt prints with "Offline Receipt — Sync Pending".
   - Restart the backend; within 30s the order flips to `synced`.

3. **Duplicate sync**:
   - With dev tools open, force a second `window.pos.syncTick()` immediately
     after the first.
   - Backend should respond `duplicate` for the already-synced event and the
     POS should not show a new entry.

4. **Stock conflict**:
   - In the backend admin, drop a variant's central inventory below the POS's
     last-synced snapshot.
   - Sell that variant offline.
   - On sync, expect a `stock_conflict` row in `sync_conflict` and the queue
     event to land in `conflict` status.

5. **Blocked device**:
   - Set the POS device's status to `blocked` in the admin.
   - Attempt to sync — push should fail with an `invalid_device` error.

## Hardware

- **Barcode scanner**: most USB barcode scanners emulate a keyboard. The
  barcode input on POSPage is autofocused; scan a label and hit Enter.
- **Thermal printer**: receipts print via Electron's HTML printer. Real
  thermal ESC/POS support is a TODO (see `apps/pos-app/src/main/printer.ts`).
