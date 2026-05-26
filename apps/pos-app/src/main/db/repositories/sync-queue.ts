import Database from "better-sqlite3";
import type { SyncEventType } from "@pos/shared";

export class SyncQueueRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Enqueue an event. Uses INSERT OR IGNORE on idempotency_key so retries of
   * the same offline operation do not create duplicate queue rows.
   */
  enqueue(args: {
    event_type: SyncEventType;
    idempotency_key: string;
    payload: Record<string, unknown>;
  }) {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO local_sync_queue
           (event_type, idempotency_key, payload, status, retry_count, created_at, updated_at)
         VALUES (?, ?, ?, 'pending', 0, ?, ?)`,
      )
      .run(args.event_type, args.idempotency_key, JSON.stringify(args.payload), now, now);
    return {
      enqueued: result.changes > 0,
      id: Number(result.lastInsertRowid),
    };
  }

  listPending(limit = 50) {
    const rows = this.db
      .prepare(
        `SELECT * FROM local_sync_queue
          WHERE status IN ('pending', 'failed')
          ORDER BY id ASC
          LIMIT ?`,
      )
      .all(limit) as any[];
    return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
  }

  markSyncing(ids: number[]) {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => "?").join(",");
    this.db
      .prepare(
        `UPDATE local_sync_queue SET status = 'syncing', updated_at = ? WHERE id IN (${placeholders})`,
      )
      .run(new Date().toISOString(), ...ids);
  }

  markSynced(id: number, serverReferenceId?: string) {
    this.db
      .prepare(
        `UPDATE local_sync_queue
            SET status = 'synced',
                server_reference_id = ?,
                updated_at = ?
          WHERE id = ?`,
      )
      .run(serverReferenceId ?? null, new Date().toISOString(), id);
  }

  markFailed(id: number, error: string) {
    this.db
      .prepare(
        `UPDATE local_sync_queue
            SET status = 'failed',
                retry_count = retry_count + 1,
                last_error = ?,
                updated_at = ?
          WHERE id = ?`,
      )
      .run(error, new Date().toISOString(), id);
  }

  markConflict(id: number, error: string) {
    this.db
      .prepare(
        `UPDATE local_sync_queue
            SET status = 'conflict',
                last_error = ?,
                updated_at = ?
          WHERE id = ?`,
      )
      .run(error, new Date().toISOString(), id);
  }

  stats() {
    const rows = this.db
      .prepare(
        `SELECT status, COUNT(*) AS count FROM local_sync_queue GROUP BY status`,
      )
      .all() as Array<{ status: string; count: number }>;
    const out: Record<string, number> = {
      pending: 0,
      syncing: 0,
      synced: 0,
      failed: 0,
      conflict: 0,
    };
    for (const r of rows) out[r.status] = r.count;
    return out;
  }
}
