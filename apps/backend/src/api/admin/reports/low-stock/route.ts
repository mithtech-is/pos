import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { ok, serverError } from "../../../_utils/response";

const DEFAULT_THRESHOLD = 5;

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const threshold = Number(
      (req.query as any).threshold ?? DEFAULT_THRESHOLD,
    );
    const inventoryService = (req as any).scope.resolve("inventory");
    if (!inventoryService) return ok(res, { items: [], count: 0 });
    const levels = await inventoryService.listInventoryLevels({});
    const items = levels
      .map((l: any) => ({
        variant_id: l.inventory_item_id,
        stock_location_id: l.location_id,
        current_stock: Number(l.stocked_quantity ?? 0) - Number(l.reserved_quantity ?? 0),
      }))
      .filter((row: any) => row.current_stock <= threshold)
      .map((row: any) => ({
        ...row,
        minimum_required_stock: threshold,
        shortage_quantity: Math.max(0, threshold - row.current_stock),
        suggested_reorder_quantity: Math.max(threshold * 2, 10),
      }));
    return ok(res, { items, count: items.length });
  } catch (err) {
    return serverError(res, err);
  }
}
