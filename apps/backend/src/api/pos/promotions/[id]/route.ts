import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";
import { ok, serverError } from "../../../_utils/response";

/** DELETE /pos/promotions/:id — remove a promotion. Returns the updated list. */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params as { id: string };
  try {
    const storeSvc = (req as any).scope.resolve(Modules.STORE);
    const [store] = await storeSvc.listStores();
    const promos = (store?.metadata?.pos_promotions as any[]) ?? [];
    const next = promos.filter((p) => p.id !== id);
    await storeSvc.updateStores(store.id, {
      metadata: { ...(store.metadata ?? {}), pos_promotions: next },
    });
    return ok(res, next);
  } catch (err) {
    return serverError(res, err);
  }
}
