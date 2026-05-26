import { model } from "@medusajs/framework/utils";
import { SyncEvent } from "./sync-event";

export const SyncBatch = model.define("sync_batch", {
  id: model.id().primaryKey(),
  device_id: model.text().searchable(),
  /** Client-generated batch ID, e.g. "batch_20260518_001". */
  batch_id: model.text().unique(),
  status: model
    .enum(["received", "processing", "completed", "partial", "failed"])
    .default("received"),
  started_at: model.dateTime().nullable(),
  completed_at: model.dateTime().nullable(),
  total_events: model.number().default(0),
  success_count: model.number().default(0),
  failed_count: model.number().default(0),
  conflict_count: model.number().default(0),
  events: model.hasMany(() => SyncEvent, { mappedBy: "batch" }),
});

export default SyncBatch;
