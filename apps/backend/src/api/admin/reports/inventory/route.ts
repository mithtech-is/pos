import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { ok, serverError } from "../../../_utils/response";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const inventoryService = (req as any).scope.resolve("inventory");
    if (!inventoryService) return ok(res, { items: [], count: 0 });
    const levels = await inventoryService.listInventoryLevels({});
    const items = levels.map((l: any) => ({
      variant_id: l.inventory_item_id,
      stock_location_id: l.location_id,
      current_stock: l.stocked_quantity,
      reserved: l.reserved_quantity,
      available: Number(l.stocked_quantity ?? 0) - Number(l.reserved_quantity ?? 0),
    }));
    return ok(res, { items, count: items.length });
  } catch (err) {
    return serverError(res, err);
  }
}
