import Database from "better-sqlite3";

export class AuditRepository {
  constructor(private readonly db: Database.Database) {}

  log(payload: {
    user_id?: string;
    device_id?: string;
    action: string;
    data?: Record<string, unknown>;
  }) {
    return this.db
      .prepare(
        `INSERT INTO local_audit_logs (user_id, device_id, action, payload, sync_status, created_at)
           VALUES (?, ?, ?, ?, 'pending', ?)`,
      )
      .run(
        payload.user_id ?? null,
        payload.device_id ?? null,
        payload.action,
        payload.data ? JSON.stringify(payload.data) : null,
        new Date().toISOString(),
      );
  }
}
