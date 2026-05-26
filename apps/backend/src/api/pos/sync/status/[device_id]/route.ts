import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { MODULE_KEYS } from "../../../../../modules";
import { ok, serverError } from "../../../../_utils/response";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { device_id } = req.params as { device_id: string };
  try {
    const sync = req.scope.resolve<any>(MODULE_KEYS.OFFLINE_SYNC);
    const [pending, conflicts] = await Promise.all([
      sync.listSyncEvents({ device_id, status: "pending" }),
      sync.listSyncConflicts({ device_id, resolution_status: "open" }),
    ]);
    return ok(res, {
      device_id,
      pending_events: pending.length,
      open_conflicts: conflicts.length,
      checked_at: new Date().toISOString(),
    });
  } catch (err) {
    return serverError(res, err);
  }
}
