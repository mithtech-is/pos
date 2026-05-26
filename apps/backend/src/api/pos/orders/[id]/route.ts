import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { ok, notFound, serverError } from "../../../_utils/response";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params as { id: string };
  try {
    const orderService = req.scope.resolve<any>("order");
    if (!orderService) return notFound(res, "Order service unavailable");
    const order = await orderService.retrieveOrder(id).catch(() => null);
    if (!order) return notFound(res, "Order not found");
    return ok(res, order);
  } catch (err) {
    return serverError(res, err);
  }
}
