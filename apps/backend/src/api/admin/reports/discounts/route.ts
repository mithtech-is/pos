import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { ok, serverError } from "../../../_utils/response";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const orderService = (req as any).scope.resolve("order");
    const orders = orderService
      ? await orderService.listOrders({}, { take: 5000 })
      : [];
    const items = orders
      .filter((o: any) => Number(o.discount_total ?? 0) > 0)
      .map((o: any) => ({
        order_number: o.display_id ?? o.id,
        cashier: o.metadata?.pos_cashier_id,
        discount_amount: o.discount_total,
        discount_percentage: o.subtotal
          ? (Number(o.discount_total) / Number(o.subtotal)) * 100
          : 0,
        approved_by: o.metadata?.discount_approved_by,
        created_at: o.created_at,
      }));
    return ok(res, { items, count: items.length });
  } catch (err) {
    return serverError(res, err);
  }
}
