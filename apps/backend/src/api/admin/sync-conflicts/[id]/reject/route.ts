import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { MODULE_KEYS } from "../../../../../modules";
import { ok, badRequest, serverError } from "../../../../_utils/response";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params as { id: string };
  const { resolved_by, note } = (req.body ?? {}) as any;
  if (!resolved_by) return badRequest(res, "resolved_by is required");
  try {
    const sync = req.scope.resolve<any>(MODULE_KEYS.OFFLINE_SYNC);
    await sync.rejectConflict(id, resolved_by, note);
    return ok(res, { rejected: true });
  } catch (err) {
    return serverError(res, err);
  }
}
