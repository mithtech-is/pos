import { model } from "@medusajs/framework/utils";
import { POSSession } from "./pos-session";

export const POSDevice = model.define("pos_device", {
  id: model.id().primaryKey(),
  device_code: model.text().unique(),
  device_name: model.text(),
  store_location_id: model.text().nullable(),
  sales_channel_id: model.text().nullable(),
  assigned_user_id: model.text().nullable(),
  last_sync_at: model.dateTime().nullable(),
  registered_at: model.dateTime().nullable(),
  blocked_at: model.dateTime().nullable(),
  status: model
    .enum([
      "pending_registration",
      "active",
      "suspended",
      "blocked",
      "retired",
    ])
    .default("pending_registration"),
  /**
   * Per-device registration token issued at register time. The POS app stores
   * this securely and sends it on every sync push.
   */
  registration_token: model.text().nullable(),
  sessions: model.hasMany(() => POSSession, { mappedBy: "device" }),
});

export default POSDevice;
