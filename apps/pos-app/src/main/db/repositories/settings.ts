import Database from "better-sqlite3";

export class SettingsRepository {
  constructor(private readonly db: Database.Database) {}

  get<T = unknown>(key: string): T | null {
    const row = this.db
      .prepare("SELECT value FROM local_settings WHERE key = ?")
      .get(key) as { value: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return row.value as unknown as T;
    }
  }

  set(key: string, value: unknown) {
    return this.db
      .prepare(
        `INSERT INTO local_settings (key, value, updated_at)
           VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`,
      )
      .run(key, JSON.stringify(value), new Date().toISOString());
  }
}
