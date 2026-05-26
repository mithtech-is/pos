import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { ok, serverError } from "../../../_utils/response";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const orderService = (req as any).scope.resolve("order");
    const orders = orderService
      ? await orderService.listOrders({}, { take: 5000 })
      : [];
    const grouped = new Map<string, any>();
    for (const o of orders) {
      for (const i of o.items ?? []) {
        const key = i.variant_id;
        const row = grouped.get(key) ?? {
          variant_id: i.variant_id,
          sku: i.metadata?.sku,
          product_name: i.title,
          quantity_sold: 0,
          gross_sales: 0,
          discount: 0,
          net_sales: 0,
        };
        row.quantity_sold += Number(i.quantity ?? 0);
        row.gross_sales += Number(i.subtotal ?? 0);
        row.discount += Number(i.discount_total ?? 0);
        row.net_sales += Number(i.total ?? 0);
        grouped.set(key, row);
      }
    }
    const items = Array.from(grouped.values()).sort(
      (a, b) => b.quantity_sold - a.quantity_sold,
    );
    return ok(res, { items, count: items.length });
  } catch (err) {
    return serverError(res, err);
  }
}
