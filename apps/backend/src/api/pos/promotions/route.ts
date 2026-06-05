import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";
import { ok, badRequest, serverError } from "../../_utils/response";

/**
 * POS promotions, stored as a simple list on store.metadata.pos_promotions.
 * Deliberately lightweight (no Medusa promotion rule engine) so the POS can
 * pull them, cache them locally and apply them offline.
 */
async function loadStore(scope: any) {
  const storeSvc = scope.resolve(Modules.STORE);
  const [store] = await storeSvc.listStores();
  const promos = (store?.metadata?.pos_promotions as any[]) ?? [];
  return { storeSvc, store, promos };
}

/** GET /pos/promotions — list all promotions. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { promos } = await loadStore((req as any).scope);
    return ok(res, promos);
  } catch (err) {
    return serverError(res, err);
  }
}

/** POST /pos/promotions — create a promotion. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as any;
  const code = String(body.code ?? "").trim().toUpperCase();
  const type = body.type;
  const value = Math.max(0, Number(body.value ?? 0) || 0);
  if (!code) return badRequest(res, "code is required");
  if (!["percent", "flat", "bogo"].includes(type)) {
    return badRequest(res, "type must be percent, flat or bogo");
  }
  if (type !== "bogo" && !(value > 0)) return badRequest(res, "value must be greater than 0");

  try {
    const { storeSvc, store, promos } = await loadStore((req as any).scope);
    if (promos.some((p) => p.code === code)) {
      return badRequest(res, "a promotion with that code already exists");
    }
    const promo = {
      id: `promo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      code,
      type,
      value,
      min_subtotal: body.min_subtotal != null ? Math.max(0, Number(body.min_subtotal) || 0) : null,
      starts_at: body.starts_at || null,
      ends_at: body.ends_at || null,
      active: body.active !== false,
    };
    const next = [...promos, promo];
    await storeSvc.updateStores(store.id, {
      metadata: { ...(store.metadata ?? {}), pos_promotions: next },
    });
    return ok(res, next, 201);
  } catch (err) {
    return serverError(res, err);
  }
}
