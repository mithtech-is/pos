import { model } from "@medusajs/framework/utils";
import { SyncBatch } from "./sync-batch";

/**
 * One offline-originated event (order.created, return.created, ...) routed
 * through the sync pipeline.
 *
 * idempotency_key follows the contract: device_id + ":" + local_order_id.
 * The unique index on this column is what guarantees we never create
 * duplicate central orders even if the POS retries the same payload.
 */
export const SyncEvent = model.define("sync_event", {
  id: model.id().primaryKey(),
  device_id: model.text().searchable(),
  event_type: model.text().searchable(),
  idempotency_key: model.text().unique(),
  payload: model.json(),
  status: model
    .enum(["pending", "syncing", "synced", "failed", "conflict"])
    .default("pending"),
  error_code: model.text().nullable(),
  error_message: model.text().nullable(),
  /** Backend reference (order_id / return_id / adjustment_id) once accepted. */
  server_reference_id: model.text().nullable(),
  batch: model.belongsTo(() => SyncBatch, { mappedBy: "events" }),
});

export default SyncEvent;
