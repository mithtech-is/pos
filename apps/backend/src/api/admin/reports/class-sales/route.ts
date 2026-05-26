import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { ok, serverError } from "../../../_utils/response";

/**
 * Class-wise sales. Derives the (school_id, class_id, gender, uniform_type)
 * grouping from order.metadata set during create-pos-order-workflow.
 *
 * TODO: factor out into ReportsService.classSales once metadata is consistently
 * populated by the POS app for every line item.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const orderService = (req as any).scope.resolve("order");
    const orders = orderService
      ? await orderService.listOrders({}, { take: 5000 })
      : [];
    const grouped = new Map<string, any>();
    for (const o of orders) {
      const key = [
        o.metadata?.school_id ?? "",
        o.metadata?.class_id ?? "",
        o.metadata?.gender ?? "",
        o.metadata?.uniform_type ?? "",
      ].join("|");
      const row = grouped.get(key) ?? {
        school_id: o.metadata?.school_id,
        class_id: o.metadata?.class_id,
        gender: o.metadata?.gender,
        uniform_type: o.metadata?.uniform_type,
        orders: 0,
        items_sold: 0,
        net_sales: 0,
      };
      row.orders += 1;
      row.items_sold += (o.items ?? []).reduce(
        (s: number, i: any) => s + Number(i.quantity ?? 0),
        0,
      );
      row.net_sales += Number(o.total ?? 0);
      grouped.set(key, row);
    }
    const items = Array.from(grouped.values());
    return ok(res, { items, count: items.length });
  } catch (err) {
    return serverError(res, err);
  }
}
