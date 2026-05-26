import { MedusaService } from "@medusajs/framework/utils";
import { SyncBatch } from "./models/sync-batch";
import { SyncEvent } from "./models/sync-event";
import { SyncConflict } from "./models/sync-conflict";

class OfflineSyncModuleService extends MedusaService({
  SyncBatch,
  SyncEvent,
  SyncConflict,
}) {
  /**
   * Find an already-processed event by its idempotency key.
   * Used as the first step in sync-offline-order-workflow so retries are safe.
   */
  async findByIdempotencyKey(key: string) {
    const [event] = await this.listSyncEvents({ idempotency_key: key });
    return event ?? null;
  }

  async startBatch(args: {
    batch_id: string;
    device_id: string;
    total_events: number;
  }) {
    return this.createSyncBatches({
      ...args,
      status: "processing",
      started_at: new Date(),
    });
  }

  async finalizeBatch(
    id: string,
    counts: {
      success_count: number;
      failed_count: number;
      conflict_count: number;
    },
  ) {
    const total =
      counts.success_count + counts.failed_count + counts.conflict_count;
    let status: "completed" | "partial" | "failed";
    if (counts.success_count === total) status = "completed";
    else if (counts.success_count > 0) status = "partial";
    else status = "failed";

    return this.updateSyncBatches({
      selector: { id },
      data: { ...counts, status, completed_at: new Date() },
    });
  }

  async recordEvent(args: {
    batch_id: string;
    device_id: string;
    event_type: string;
    idempotency_key: string;
    payload: Record<string, unknown>;
  }) {
    return this.createSyncEvents({
      batch_id: args.batch_id,
      device_id: args.device_id,
      event_type: args.event_type,
      idempotency_key: args.idempotency_key,
      payload: args.payload,
      status: "pending",
    });
  }

  async markEventSynced(id: string, serverReferenceId: string) {
    return this.updateSyncEvents({
      selector: { id },
      data: { status: "synced", server_reference_id: serverReferenceId },
    });
  }

  async markEventFailed(id: string, code: string, message: string) {
    return this.updateSyncEvents({
      selector: { id },
      data: { status: "failed", error_code: code, error_message: message },
    });
  }

  async raiseConflict(args: {
    event_id: string;
    device_id: string;
    conflict_type:
      | "duplicate_order"
      | "stock_conflict"
      | "product_inactive"
      | "price_changed"
      | "tax_mismatch"
      | "invalid_cashier"
      | "invalid_device"
      | "invalid_school_mapping";
    severity?: "low" | "medium" | "high" | "critical";
    payload: Record<string, unknown>;
  }) {
    await this.updateSyncEvents({
      selector: { id: args.event_id },
      data: { status: "conflict" },
    });
    return this.createSyncConflicts({
      ...args,
      severity: args.severity ?? "medium",
      resolution_status: "open",
    });
  }

  async resolveConflict(
    id: string,
    resolvedBy: string,
    note?: string,
  ) {
    return this.updateSyncConflicts({
      selector: { id },
      data: {
        resolution_status: "resolved",
        resolved_by: resolvedBy,
        resolved_at: new Date(),
        resolution_note: note ?? null,
      },
    });
  }

  async rejectConflict(id: string, resolvedBy: string, note?: string) {
    return this.updateSyncConflicts({
      selector: { id },
      data: {
        resolution_status: "rejected",
        resolved_by: resolvedBy,
        resolved_at: new Date(),
        resolution_note: note ?? null,
      },
    });
  }
}

export default OfflineSyncModuleService;
