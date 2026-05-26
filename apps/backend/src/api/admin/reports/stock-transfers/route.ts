import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { ok, serverError } from "../../../_utils/response";

/**
 * Stock transfers. Medusa v2's inventory module exposes stock-movements which
 * we can present as transfers when their reason is "transfer".
 *
 * TODO: build a richer transfer model (from_location, to_location, in_transit
 * quantity) — out of scope for MVP per the spec.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const inventoryService = (req as any).scope.resolve("inventory");
    if (!inventoryService?.listInventoryMovements) {
      return ok(res, { items: [], count: 0 });
    }
    const items = await inventoryService.listInventoryMovements(
      { reason: "transfer" },
      { take: 500, order: { created_at: "DESC" } },
    );
    return ok(res, { items, count: items.length });
  } catch (err) {
    return serverError(res, err);
  }
}
