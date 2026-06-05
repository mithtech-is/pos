import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";
import { ok, badRequest, serverError } from "../../_utils/response";

/** Suppliers / vendors, stored on store.metadata.pos_suppliers. */
async function loadStore(scope: any) {
  const storeSvc = scope.resolve(Modules.STORE);
  const [store] = await storeSvc.listStores();
  const suppliers = (store?.metadata?.pos_suppliers as any[]) ?? [];
  return { storeSvc, store, suppliers };
}

/** GET /pos/suppliers */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { suppliers } = await loadStore((req as any).scope);
    return ok(res, suppliers);
  } catch (err) {
    return serverError(res, err);
  }
}

/** POST /pos/suppliers { name, phone?, email? } */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as { name?: string; phone?: string; email?: string };
  const name = (body.name ?? "").trim();
  if (!name) return badRequest(res, "name is required");
  try {
    const { storeSvc, store, suppliers } = await loadStore((req as any).scope);
    const supplier = {
      id: `sup_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      phone: (body.phone ?? "").trim() || null,
      email: (body.email ?? "").trim() || null,
    };
    const next = [...suppliers, supplier];
    await storeSvc.updateStores(store.id, {
      metadata: { ...(store.metadata ?? {}), pos_suppliers: next },
    });
    return ok(res, next, 201);
  } catch (err) {
    return serverError(res, err);
  }
}
