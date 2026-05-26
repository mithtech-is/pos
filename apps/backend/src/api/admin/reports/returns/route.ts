import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { ok, serverError } from "../../../_utils/response";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const orderService = (req as any).scope.resolve("order");
    if (!orderService?.listReturns) return ok(res, { items: [], count: 0 });
    const returns = await orderService.listReturns({}, { take: 1000 });
    return ok(res, { items: returns, count: returns.length });
  } catch (err) {
    return serverError(res, err);
  }
}
