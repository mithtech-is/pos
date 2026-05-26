# POS App Setup

The POS app is an Electron + React + TypeScript application living in
`apps/pos-app`. It owns the SQLite local database, the sync worker, and the
printer integration.

## 1. Install

```sh
npm install
```

`better-sqlite3` is a native module — npm will rebuild it for the Electron
binary on your machine. On Windows you need the
[`windows-build-tools`](https://github.com/felixrieseberg/windows-build-tools)
toolchain (Visual Studio Build Tools 2019+ with the C++ workload).

## 2. Environment

```sh
cp apps/pos-app/.env.example apps/pos-app/.env
```

You can also (and should) override these from the in-app Settings screen,
which writes to the local SQLite settings table.

## 3. Run in development

```sh
npm --workspace apps/pos-app run dev:electron
```

This concurrently:
- starts the Vite dev server (renderer) at http://localhost:5173, and
- compiles the main process via `tsc` then launches Electron pointing at it.

DevTools opens on the right by default.

## 4. Build a production bundle

```sh
npm --workspace apps/pos-app run build       # build only
npm --workspace apps/pos-app run package     # build + electron-builder
```

The Windows NSIS installer lands under `release/`. macOS DMG and Linux
AppImage targets are configured but secondary; the spec prioritizes Windows.

## File layout

```
apps/pos-app/src/
  main/                       Electron main process
    main.ts                   Entry point — boots window + workers
    db/
      index.ts                Database, IPC handlers, repository factory
      schema.sql              Baseline SQLite schema
      migrations.ts           Sequential migration runner
      repositories/           Typed access to local_* tables
    sync-worker.ts            Pull + push worker
    printer.ts                Receipt rendering & printing
  preload/preload.ts          contextBridge → window.pos
  renderer/
    App.tsx                   Router + topbar
    pages/                    LoginPage, POSPage, OrdersPage, ...
    components/               SyncStatusBadge
    state/                    Zustand stores: auth, cart
```

## How offline mode behaves

- The sync worker runs in the main process every 30 seconds.
- If the backend is unreachable, the worker logs and leaves events in the
  queue with status `pending`/`failed`.
- All UI flows remain functional. Search and barcode lookups read from
  SQLite only; they do not call out to the backend.
- New offline orders advance through the lifecycle:
  `pending → syncing → synced` (or `→ failed`/`→ conflict`).

## Manual offline test

1. Sign in online to the POS, then stop the backend.
2. Sell a kit and complete the sale.
3. Open the **Orders** tab — the order is listed as `pending`.
4. Restart the backend.
5. Within ~30 seconds the **Pending** tab clears and the order shows the
   server reference in the **Orders** tab.
