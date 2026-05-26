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
        const key = [i.metadata?.school_id ?? "", i.metadata?.category ?? "", i.metadata?.size ?? ""].join("|");
        const row = grouped.get(key) ?? {
          school_id: i.metadata?.school_id,
          category: i.metadata?.category,
          size: i.metadata?.size,
          quantity_sold: 0,
          net_movement: 0,
        };
        row.quantity_sold += Number(i.quantity ?? 0);
        row.net_movement += Number(i.quantity ?? 0);
        grouped.set(key, row);
      }
    }
    const items = Array.from(grouped.values());
    return ok(res, { items, count: items.length });
  } catch (err) {
    return serverError(res, err);
  }
}
