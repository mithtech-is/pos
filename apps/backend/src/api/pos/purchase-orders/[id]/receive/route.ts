import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";
import { ok, badRequest, notFound, serverError } from "../../../../_utils/response";

/**
 * POST /pos/purchase-orders/:id/receive — goods receipt.
 * Adds each line's qty to that variant's stock-on-hand, then marks the PO
 * received. Idempotent-guarded: a PO can only be received once.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params as { id: string };
  try {
    const scope = (req as any).scope;
    const storeSvc = scope.resolve(Modules.STORE);
    const productSvc = scope.resolve(Modules.PRODUCT);
    const [store] = await storeSvc.listStores();
    const pos = (store?.metadata?.pos_purchase_orders as any[]) ?? [];
    const po = pos.find((p) => p.id === id);
    if (!po) return notFound(res, "Purchase order not found");
    if (po.status === "received") return badRequest(res, "Purchase order already received");

    const received: any[] = [];
    for (const line of po.lines ?? []) {
      const [v] = await productSvc.listProductVariants({ sku: line.sku });
      if (!v) {
        received.push({ sku: line.sku, ok: false, reason: "sku not found" });
        continue;
      }
      const m = v.metadata ?? {};
      const stock = Number(m.stock_on_hand ?? 0) + Number(line.qty);
      await productSvc.updateProductVariants(v.id, {
        metadata: { ...m, stock_on_hand: stock, reorder_point: Number(m.reorder_point ?? 0) },
      });
      received.push({ sku: line.sku, ok: true, stock_on_hand: stock });
    }

    const next = pos.map((p) =>
      p.id === id ? { ...p, status: "received", received_at: new Date().toISOString() } : p,
    );
    await storeSvc.updateStores(store.id, {
      metadata: { ...(store.metadata ?? {}), pos_purchase_orders: next },
    });

    return ok(res, { id, status: "received", received });
  } catch (err) {
    return serverError(res, err);
  }
}
