import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { createReturn } from "../../../workflows";
import { ok, badRequest, serverError } from "../../_utils/response";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = req.body as any;
  if (!body?.original_order_id || !Array.isArray(body.items) || !body.idempotency_key) {
    return badRequest(
      res,
      "original_order_id, items[] and idempotency_key are required",
    );
  }
  try {
    const result = await createReturn((req as any).scope, body);
    return ok(res, result, 201);
  } catch (err) {
    return serverError(res, err);
  }
}
