import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";
import { ok, badRequest, serverError } from "../../_utils/response";

/** Purchase orders, stored on store.metadata.pos_purchase_orders. */
async function loadStore(scope: any) {
  const storeSvc = scope.resolve(Modules.STORE);
  const [store] = await storeSvc.listStores();
  const pos = (store?.metadata?.pos_purchase_orders as any[]) ?? [];
  return { storeSvc, store, pos };
}

/** GET /pos/purchase-orders */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { pos } = await loadStore((req as any).scope);
    pos.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return ok(res, pos);
  } catch (err) {
    return serverError(res, err);
  }
}

/** POST /pos/purchase-orders { supplier_id, supplier_name?, lines:[{sku,qty,cost}] } */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as {
    supplier_id?: string;
    supplier_name?: string;
    lines?: Array<{ sku: string; qty: number; cost?: number }>;
  };
  const lines = (body.lines ?? []).filter((l) => l && l.sku && Number(l.qty) > 0);
  if (lines.length === 0) return badRequest(res, "at least one line with a sku and qty is required");
  try {
    const { storeSvc, store, pos } = await loadStore((req as any).scope);
    const cleanLines = lines.map((l) => ({
      sku: String(l.sku).trim(),
      qty: Number(l.qty),
      cost: Number(l.cost ?? 0),
    }));
    const total = cleanLines.reduce((s, l) => s + l.qty * l.cost, 0);
    const po = {
      id: `po_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      supplier_id: body.supplier_id ?? null,
      supplier_name: body.supplier_name ?? null,
      status: "ordered",
      lines: cleanLines,
      total,
      created_at: new Date().toISOString(),
      received_at: null,
    };
    const next = [...pos, po];
    await storeSvc.updateStores(store.id, {
      metadata: { ...(store.metadata ?? {}), pos_purchase_orders: next },
    });
    return ok(res, po, 201);
  } catch (err) {
    return serverError(res, err);
  }
}
