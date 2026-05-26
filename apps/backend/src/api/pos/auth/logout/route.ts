import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { ok } from "../../../_utils/response";

export async function POST(_req: MedusaRequest, res: MedusaResponse) {
  // TODO: revoke the token in the Medusa auth module.
  return ok(res, { logged_out: true });
}
