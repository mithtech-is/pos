import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { MODULE_KEYS } from "../../../../modules";
import { ok, serverError } from "../../../_utils/response";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const devices = (req as any).scope.resolve(MODULE_KEYS.POS_DEVICE);
    const sync = (req as any).scope.resolve(MODULE_KEYS.OFFLINE_SYNC);
    const allDevices = await devices.listPOSDevices({});
    const items: any[] = [];
    for (const d of allDevices) {
      const pending = await sync.listSyncEvents({
        device_id: d.id,
        status: "pending",
      });
      const failed = await sync.listSyncEvents({
        device_id: d.id,
        status: "failed",
      });
      const conflicts = await sync.listSyncConflicts({
        device_id: d.id,
        resolution_status: "open",
      });
      items.push({
        device_code: d.device_code,
        device_name: d.device_name,
        status: d.status,
        last_sync_at: d.last_sync_at,
        pending_orders: pending.length,
        failed_orders: failed.length,
        conflicts: conflicts.length,
      });
    }
    return ok(res, { items, count: items.length });
  } catch (err) {
    return serverError(res, err);
  }
}
