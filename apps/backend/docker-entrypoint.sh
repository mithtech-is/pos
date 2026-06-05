#!/bin/sh
# Wait for Postgres to accept connections, run pending migrations, then hand off
# to the container CMD (medusa develop). Migrations are idempotent, so this is
# safe to run on every boot.
set -e

DB_HOST="${DB_HOST:-db}"
DB_PORT="${DB_PORT:-5432}"

echo "[entrypoint] waiting for database at ${DB_HOST}:${DB_PORT} ..."
i=0
until node -e "require('net').connect(${DB_PORT}, '${DB_HOST}').on('connect', () => process.exit(0)).on('error', () => process.exit(1))" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "[entrypoint] database not reachable after 60 tries — giving up." >&2
    exit 1
  fi
  sleep 1
done

echo "[entrypoint] database is up; running migrations ..."
npx medusa db:migrate

echo "[entrypoint] migrations complete; starting backend on port ${PORT:-9000} ..."
exec "$@"
