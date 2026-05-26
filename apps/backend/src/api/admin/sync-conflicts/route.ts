import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { MODULE_KEYS } from "../../../modules";
import { ok, serverError } from "../../_utils/response";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const sync = req.scope.resolve<any>(MODULE_KEYS.OFFLINE_SYNC);
    const {
      conflict_type,
      severity,
      device_id,
      resolution_status,
      limit = "50",
      offset = "0",
    } = req.query as Record<string, string>;

    const filter: Record<string, unknown> = {};
    if (conflict_type) filter.conflict_type = conflict_type;
    if (severity) filter.severity = severity;
    if (device_id) filter.device_id = device_id;
    if (resolution_status) filter.resolution_status = resolution_status;
    else filter.resolution_status = "open";

    const items = await sync.listSyncConflicts(filter, {
      take: Number(limit),
      skip: Number(offset),
      order: { created_at: "DESC" },
    });
    return ok(res, {
      items,
      count: items.length,
      limit: Number(limit),
      offset: Number(offset),
    });
  } catch (err) {
    return serverError(res, err);
  }
}
