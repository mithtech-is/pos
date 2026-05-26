import { model } from "@medusajs/framework/utils";

export const SyncConflict = model.define("sync_conflict", {
  id: model.id().primaryKey(),
  event_id: model.text(),
  device_id: model.text().searchable(),
  conflict_type: model.enum([
    "duplicate_order",
    "stock_conflict",
    "product_inactive",
    "price_changed",
    "tax_mismatch",
    "invalid_cashier",
    "invalid_device",
    "invalid_school_mapping",
  ]),
  severity: model.enum(["low", "medium", "high", "critical"]).default("medium"),
  payload: model.json(),
  resolution_status: model
    .enum(["open", "in_progress", "resolved", "rejected"])
    .default("open"),
  resolution_note: model.text().nullable(),
  resolved_by: model.text().nullable(),
  resolved_at: model.dateTime().nullable(),
});

export default SyncConflict;
