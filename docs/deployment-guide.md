# Deployment Guide

## Backend

The backend is a standard Medusa.js v2 deployment. Two modes:

### Single-node (small distributor)

- VPS with Node 20+, PostgreSQL 16, Redis 7.
- Reverse-proxy (Nginx / Caddy) terminates TLS and forwards to `localhost:9000`.
- Run as a systemd service:

```ini
# /etc/systemd/system/pos-backend.service
[Unit]
Description=School Uniform POS backend
After=network.target postgresql.service redis-server.service

[Service]
Type=simple
WorkingDirectory=/opt/pos/apps/backend
EnvironmentFile=/opt/pos/apps/backend/.env
ExecStart=/usr/bin/node /opt/pos/apps/backend/.medusa/server/main.js
Restart=always
User=pos
Group=pos

[Install]
WantedBy=multi-user.target
```

### Docker / cloud

Build artifacts:

```sh
npm --workspace apps/backend run build
```

Result is in `apps/backend/.medusa/server`. Bundle with PostgreSQL + Redis
connection strings injected via environment variables.

## POS device onboarding

1. Install Windows MSI/EXE produced by `npm --workspace apps/pos-app run package`.
2. Launch the app. The login screen shows a Backend URL field — point it at
   the distributor's backend.
3. In the admin, register the device:
   ```sh
   curl -X POST https://backend/pos/device/register \
     -H 'Content-Type: application/json' \
     -d '{"device_code":"POS017","device_name":"Camp 17","registered_by":"admin"}'
   ```
   Copy the `registration_token` from the response.
4. In the POS Settings screen, paste the device code + token and Save.
5. Sign in online — the user record and PIN hash hydrate locally so future
   offline PIN unlocks work.
6. Run a small test sale to confirm receipt printing.

## Backup plan (spec section 24.4)

- The SQLite file lives at `<userData>/pos-data/pos.sqlite` (Electron
  `app.getPath('userData')`). Back this up to USB / network drive on a
  schedule — copying while the app runs is safe because WAL mode is on.
- For emergency recovery (lost device), unsynced orders can be exported as
  JSON by querying `local_sync_queue` via the SQLite CLI:
  ```sh
  sqlite3 pos.sqlite "SELECT payload FROM local_sync_queue WHERE status != 'synced'"
  ```
  The result can be replayed against `/pos/sync/push` from another device or
  the admin tool.

## Hardening checklist

- [ ] Set strong `JWT_SECRET` and `COOKIE_SECRET` (32+ random bytes).
- [ ] Restrict `ADMIN_CORS` / `AUTH_CORS` to known origins.
- [ ] Enable HTTPS everywhere — POS app config refuses HTTP backends in
      production unless `--insecure` is set.
- [ ] Enforce manager PIN for: high discount, returns, exchanges, stock
      adjustment, cancel bill, reprint receipt, manual price override
      (see `MANAGER_PIN_ACTIONS` in `@pos/shared/constants`).
- [ ] Encrypt local SQLite database via `better-sqlite3-multiple-ciphers`
      once a production key-management strategy is chosen. The schema is
      portable across plain and encrypted builds.
- [ ] Rotate device registration tokens periodically.
