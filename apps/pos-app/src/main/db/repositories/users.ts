import Database from "better-sqlite3";
import crypto from "node:crypto";

/**
 * Local user / offline PIN store.
 *
 * Online login is the only way to populate this table — the backend response
 * includes a hashed offline PIN that we persist verbatim. Plain PINs never
 * touch disk.
 */
/** Parse the JSON branch_ids column into a string[] on any user row. */
function withParsedBranches<T extends { branch_ids?: unknown }>(row: T): T & { branch_ids: string[] } {
  let branch_ids: string[] = [];
  if (typeof row.branch_ids === "string" && row.branch_ids.length) {
    try {
      const parsed = JSON.parse(row.branch_ids);
      if (Array.isArray(parsed)) branch_ids = parsed.filter((x) => typeof x === "string");
    } catch {
      /* malformed -> treat as unrestricted */
    }
  }
  return { ...row, branch_ids };
}

export class UsersRepository {
  constructor(private readonly db: Database.Database) {}

  list() {
    return this.db
      .prepare(
        `SELECT id, name, email, role, branch_ids, offline_access_expires_at, status, last_login_at
           FROM local_users
          WHERE status = 'active'`,
      )
      .all()
      .map((r: any) => withParsedBranches(r));
  }

  findByEmail(email: string) {
    const row = this.db
      .prepare("SELECT * FROM local_users WHERE email = ?")
      .get(email);
    return row ? withParsedBranches(row as any) : undefined;
  }

  /** Lightweight lookup used to enforce branch scope when creating an order. */
  findById(id: string) {
    const row = this.db
      .prepare("SELECT id, name, email, role, branch_ids, status FROM local_users WHERE id = ?")
      .get(id);
    return row ? withParsedBranches(row as any) : undefined;
  }

  upsert(payload: {
    id: string;
    name: string;
    email: string;
    role: string;
    offline_access_expires_at?: string;
    pin_hash?: string;
    branch_ids?: string[] | null;
  }) {
    const now = new Date().toISOString();
    // Email is the natural identity key here (stable across login + sync). If
    // a different id ever shows up for the same email — e.g. the local DB had
    // a stub user from a previous build — wipe the old row before inserting.
    this.db
      .prepare(`DELETE FROM local_users WHERE email = ? AND id != ?`)
      .run(payload.email, payload.id);
    return this.db
      .prepare(
        `INSERT INTO local_users
           (id, name, email, role, pin_hash, branch_ids, offline_access_expires_at, status, last_login_at, updated_at)
         VALUES (@id, @name, @email, @role, @pin_hash, @branch_ids, @offline_access_expires_at, 'active', @now, @now)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           email = excluded.email,
           role = excluded.role,
           pin_hash = COALESCE(excluded.pin_hash, local_users.pin_hash),
           branch_ids = COALESCE(excluded.branch_ids, local_users.branch_ids),
           offline_access_expires_at = excluded.offline_access_expires_at,
           last_login_at = excluded.last_login_at,
           updated_at = excluded.updated_at`,
      )
      .run({
        id: payload.id,
        name: payload.name,
        email: payload.email,
        role: payload.role,
        pin_hash: payload.pin_hash ?? null,
        // Persist as JSON. `null` (field omitted) leaves the existing value
        // intact via COALESCE; an explicit [] clears the restriction.
        branch_ids:
          payload.branch_ids === undefined || payload.branch_ids === null
            ? null
            : JSON.stringify(payload.branch_ids),
        offline_access_expires_at: payload.offline_access_expires_at ?? null,
        now,
      });
  }

  /**
   * Verify a PIN against the stored salted SHA-256 hash.
   * Hash format: `sha256$<salt-hex>$<digest-hex>` — same format the backend
   * emits on login so we can store it verbatim.
   */
  verifyPin(userId: string, pin: string) {
    const row = this.db
      .prepare("SELECT pin_hash, offline_access_expires_at FROM local_users WHERE id = ?")
      .get(userId) as { pin_hash?: string; offline_access_expires_at?: string } | undefined;
    if (!row || !row.pin_hash) return { ok: false, reason: "no_pin_set" } as const;
    if (
      row.offline_access_expires_at &&
      new Date(row.offline_access_expires_at) < new Date()
    ) {
      return { ok: false, reason: "offline_session_expired" } as const;
    }
    const [scheme, salt, digest] = row.pin_hash.split("$");
    if (scheme !== "sha256" || !salt || !digest) {
      return { ok: false, reason: "invalid_hash_format" } as const;
    }
    const candidate = crypto
      .createHash("sha256")
      .update(salt + pin)
      .digest("hex");
    if (candidate !== digest) return { ok: false, reason: "wrong_pin" } as const;
    return { ok: true } as const;
  }
}
