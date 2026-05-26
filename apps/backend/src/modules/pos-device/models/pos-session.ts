import { model } from "@medusajs/framework/utils";
import { POSDevice } from "./pos-device";

export const POSSession = model.define("pos_session", {
  id: model.id().primaryKey(),
  user_id: model.text(),
  login_at: model.dateTime(),
  logout_at: model.dateTime().nullable(),
  last_online_at: model.dateTime().nullable(),
  session_status: model.enum(["open", "closed"]).default("open"),
  device: model.belongsTo(() => POSDevice, { mappedBy: "sessions" }),
});

export default POSSession;
