import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { ok, badRequest } from "../../../_utils/response";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { refresh_token } = (req.body ?? {}) as { refresh_token?: string };
  if (!refresh_token) return badRequest(res, "refresh_token is required");
  // TODO: validate the refresh token against the Medusa auth module.
  return ok(res, {
    access_token: `pos.access.${Date.now()}`,
    expires_in: 60 * 60 * 12,
  });
}
