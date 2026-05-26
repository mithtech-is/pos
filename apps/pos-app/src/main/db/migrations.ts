import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * Migration runner.
 *
 * We track applied migrations in `_pos_migrations` (id, applied_at). Each
 * migration file is a numbered .sql file in src/main/db/migrations/; the
 * baseline migration applies schema.sql verbatim.
 *
 * Future migrations: add a new file `002_xxx.sql` and they will be picked up
 * in order. Never edit a migration that has already shipped — write a new one.
 */
export function runMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _pos_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const migrationsDir = path.join(__dirname, "migrations");
  let files: string[] = [];
  try {
    files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
  } catch {
    // Migrations directory not yet present on dev machines that copy `dist/`
    // straight from build output — fall through to the embedded baseline below.
  }
  files.sort();

  const applied = new Set(
    db.prepare("SELECT id FROM _pos_migrations").all().map((r: any) => r.id),
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    db.exec(sql);
    db.prepare(
      "INSERT INTO _pos_migrations (id, applied_at) VALUES (?, ?)",
    ).run(file, new Date().toISOString());
  }

  // If no files were found (e.g., schema embedded in the bundle), fall back to
  // running schema.sql once. We tag this as the baseline so the next migration
  // file will be 002_*.
  if (files.length === 0 && !applied.has("001_baseline.sql")) {
    const baseline = fs.readFileSync(
      path.join(__dirname, "schema.sql"),
      "utf8",
    );
    db.exec(baseline);
    db.prepare(
      "INSERT INTO _pos_migrations (id, applied_at) VALUES (?, ?)",
    ).run("001_baseline.sql", new Date().toISOString());
  }
}
