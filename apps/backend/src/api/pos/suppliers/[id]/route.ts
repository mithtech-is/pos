import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";
import { ok, serverError } from "../../../_utils/response";

/** DELETE /pos/suppliers/:id — remove a supplier; returns the updated list. */
export async function DELETE(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params as { id: string };
  try {
    const storeSvc = (req as any).scope.resolve(Modules.STORE);
    const [store] = await storeSvc.listStores();
    const suppliers = (store?.metadata?.pos_suppliers as any[]) ?? [];
    const next = suppliers.filter((s) => s.id !== id);
    await storeSvc.updateStores(store.id, {
      metadata: { ...(store.metadata ?? {}), pos_suppliers: next },
    });
    return ok(res, next);
  } catch (err) {
    return serverError(res, err);
  }
}
