import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { MODULE_KEYS } from "../../../../modules";
import { ok, serverError } from "../../../_utils/response";

/** POST /pos/stores/:id { active } — activate / deactivate a store. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params as { id: string };
  const body = (req.body ?? {}) as { active?: boolean };
  const status = body.active === false ? "inactive" : "active";
  try {
    const svc = (req as any).scope.resolve(MODULE_KEYS.SCHOOL);
    await svc.updateSchools({ id, status });
    return ok(res, { id, status });
  } catch (err) {
    return serverError(res, err);
  }
}
