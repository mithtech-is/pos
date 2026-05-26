import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { resolveSyncConflict } from "../../../../../workflows";
import { ok, badRequest, serverError } from "../../../../_utils/response";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params as { id: string };
  const { resolution, resolved_by, note, payload } = (req.body ?? {}) as any;
  if (!resolution || !resolved_by) {
    return badRequest(res, "resolution and resolved_by are required");
  }
  try {
    const result = await resolveSyncConflict((req as any).scope, {
      conflict_id: id,
      resolution,
      resolved_by,
      note,
      payload,
    });
    return ok(res, result);
  } catch (err) {
    return serverError(res, err);
  }
}
