import * as SQLite from "expo-sqlite";
import { SCHEMA_SQL } from "./schema";

/**
 * Singleton accessor over expo-sqlite. The API is async (Promise-based) and
 * differs from better-sqlite3, but the schema + idempotency contract match
 * the Electron app one-to-one. Callers always go through openDb() so we never
 * leak a half-initialised handle.
 */
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function openDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    const db = await SQLite.openDatabaseAsync("pos.sqlite");
    await db.execAsync(SCHEMA_SQL);
    await ensureColumns(db);
    return db;
  })();
  return dbPromise;
}

/**
 * Idempotent additive columns for databases created before a column existed.
 * Cheap to run on every open; SCHEMA_SQL handles fresh installs, this handles
 * upgrades without a full migration framework.
 */
async function ensureColumns(db: SQLite.SQLiteDatabase): Promise<void> {
  const cols = await db.getAllAsync<{ name: string }>("PRAGMA table_info(local_users)");
  if (!cols.some((c) => c.name === "branch_ids")) {
    await db.execAsync("ALTER TABLE local_users ADD COLUMN branch_ids TEXT");
  }
}

export async function closeDb(): Promise<void> {
  if (!dbPromise) return;
  const db = await dbPromise;
  await db.closeAsync();
  dbPromise = null;
}

/** Convenience: run an arbitrary SQL with parameters. */
export async function execSql(sql: string, params: any[] = []): Promise<void> {
  const db = await openDb();
  await db.runAsync(sql, params);
}

/** Return all rows for a SELECT. */
export async function selectAll<T = any>(
  sql: string,
  params: any[] = [],
): Promise<T[]> {
  const db = await openDb();
  return db.getAllAsync<T>(sql, params);
}

/** Return the first row, or null. */
export async function selectOne<T = any>(
  sql: string,
  params: any[] = [],
): Promise<T | null> {
  const db = await openDb();
  const row = await db.getFirstAsync<T>(sql, params);
  return row ?? null;
}
