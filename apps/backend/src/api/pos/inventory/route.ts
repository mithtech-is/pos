import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";
import { ok, badRequest, notFound, serverError } from "../../_utils/response";

/**
 * Back-office inventory view: per-variant stock-on-hand + reorder point (held
 * on variant.metadata), with a low-stock flag. This is the purchasing/reorder
 * view — distinct from the POS's offline sell-side stock — so it never
 * interferes with checkout.
 */
function row(p: any, v: any) {
  const m = v.metadata ?? {};
  const stock = Number(m.stock_on_hand ?? 0);
  const reorder = Number(m.reorder_point ?? 0);
  return {
    variant_id: v.id,
    sku: v.sku,
    title: v.title,
    product_title: p.title,
    stock_on_hand: stock,
    reorder_point: reorder,
    low_stock: stock <= reorder,
  };
}

/** GET /pos/inventory — every variant with stock, reorder point and low flag. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const productSvc = (req as any).scope.resolve(Modules.PRODUCT);
    const products = await productSvc.listProducts({ status: "published" }, { relations: ["variants"] });
    const items: any[] = [];
    for (const p of products) {
      for (const v of p.variants ?? []) items.push(row(p, v));
    }
    items.sort((a, b) => Number(b.low_stock) - Number(a.low_stock) || a.product_title.localeCompare(b.product_title));
    return ok(res, items);
  } catch (err) {
    return serverError(res, err);
  }
}

/** POST /pos/inventory — set reorder point and/or adjust stock for a SKU. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as {
    sku?: string;
    reorder_point?: number;
    set_stock?: number;
    add_stock?: number;
  };
  const sku = (body.sku ?? "").trim();
  if (!sku) return badRequest(res, "sku is required");
  try {
    const productSvc = (req as any).scope.resolve(Modules.PRODUCT);
    const [v] = await productSvc.listProductVariants({ sku });
    if (!v) return notFound(res, "No variant with that SKU");
    const m = v.metadata ?? {};
    let stock = Number(m.stock_on_hand ?? 0);
    if (body.set_stock != null) stock = Number(body.set_stock);
    if (body.add_stock != null) stock += Number(body.add_stock);
    const reorder = body.reorder_point != null ? Number(body.reorder_point) : Number(m.reorder_point ?? 0);
    await productSvc.updateProductVariants(v.id, {
      metadata: { ...m, stock_on_hand: stock, reorder_point: reorder },
    });
    return ok(res, { sku, stock_on_hand: stock, reorder_point: reorder, low_stock: stock <= reorder });
  } catch (err) {
    return serverError(res, err);
  }
}
