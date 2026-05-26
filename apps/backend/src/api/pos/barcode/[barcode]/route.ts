import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { ok, notFound, serverError } from "../../../_utils/response";

/**
 * GET /pos/barcode/:barcode
 *
 * Looks up a product variant by its barcode/SKU. The POS also maintains a
 * local barcode index in SQLite, so this endpoint is only invoked when an
 * unknown barcode is scanned while online.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { barcode } = req.params as { barcode: string };
  try {
    const productService = req.scope.resolve<any>("product");
    if (!productService) {
      return notFound(res, "Product service unavailable");
    }
    const [variant] = await productService.listProductVariants({ barcode });
    if (!variant) {
      const [bySku] = await productService.listProductVariants({ sku: barcode });
      if (!bySku) return notFound(res, "No variant matches that barcode");
      return ok(res, bySku);
    }
    return ok(res, variant);
  } catch (err) {
    return serverError(res, err);
  }
}
