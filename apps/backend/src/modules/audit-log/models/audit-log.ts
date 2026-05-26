import { model } from "@medusajs/framework/utils";

export const AuditLog = model.define("audit_log", {
  id: model.id().primaryKey(),
  user_id: model.text().nullable(),
  device_id: model.text().nullable(),
  action: model.text().searchable(),
  entity_type: model.text().nullable(),
  entity_id: model.text().nullable(),
  old_value: model.json().nullable(),
  new_value: model.json().nullable(),
  ip_address: model.text().nullable(),
  /** "offline" if the action originated on the POS before sync. */
  source: model.enum(["online", "offline"]).default("online"),
});

export default AuditLog;
