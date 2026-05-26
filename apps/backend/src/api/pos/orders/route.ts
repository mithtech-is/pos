import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { createPosOrderEvent } from "../../../workflows";
import { ok, badRequest, serverError } from "../../_utils/response";
import type { OrderInput } from "@pos/shared";

/**
 * POST /pos/orders — online billing path. Same payload shape as the offline
 * sync events, so duplicate sales (online retry after timeout) deduplicate
 * via the same idempotency key.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const order = req.body as OrderInput | undefined;
  if (!order || !order.idempotency_key || !order.local_order_number) {
    return badRequest(
      res,
      "order payload requires idempotency_key and local_order_number",
    );
  }
  const deviceCode = (req as any).pos_device_code ?? order.device_id;
  try {
    const result = await createPosOrderEvent((req as any).scope, {
      device_code: deviceCode,
      order,
    });
    return ok(res, result, 201);
  } catch (err) {
    return serverError(res, err);
  }
}
