import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { MODULE_KEYS } from "../../../../modules";
import { ok, serverError } from "../../../_utils/response";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const audit = (req as any).scope.resolve(MODULE_KEYS.AUDIT_LOG);
    const { user_id, action, device_id, entity_type, limit = "100" } = req.query as Record<string, string>;
    const filter: Record<string, unknown> = {};
    if (user_id) filter.user_id = user_id;
    if (action) filter.action = action;
    if (device_id) filter.device_id = device_id;
    if (entity_type) filter.entity_type = entity_type;
    const items = await audit.listAuditLogs(filter, {
      take: Number(limit),
      order: { created_at: "DESC" },
    });
    return ok(res, { items, count: items.length });
  } catch (err) {
    return serverError(res, err);
  }
}
