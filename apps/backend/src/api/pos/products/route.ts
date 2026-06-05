import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { ok, badRequest, serverError } from "../../_utils/response";

/**
 * POST /pos/products
 *
 * Quick "scan-to-add" product creation for the POS. Given a scanned barcode, a
 * name and a price, it creates a published product + single variant carrying:
 *   - the barcode (and SKU = barcode) so the scanner can find it,
 *   - metadata.price so /pos/sync/pull hydrates the POS price without the
 *     region/pricing pipeline (matches how the seeds stamp prices), and
 *   - a REAL pricing-module price set linked to the variant so the Medusa
 *     admin pricing editor renders it (createProducts on the module service
 *     alone never makes a price set — that crashes the admin).
 *
 * Idempotent: if a variant with this barcode/SKU already exists, returns it
 * instead of creating a duplicate.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as {
    name?: string;
    title?: string;
    barcode?: string;
    sku?: string;
    price?: number | string;
    category?: string;
  };

  const productName = (body.name ?? body.title ?? "").trim();
  const code = (body.barcode ?? body.sku ?? "").trim();
  const amount = Number(body.price);
  const category = body.category?.trim() || null;

  if (!productName || !code || !amount || Number.isNaN(amount) || amount <= 0) {
    return badRequest(res, "name, barcode and a positive numeric price are required");
  }

  try {
    const scope = (req as any).scope;
    const productSvc = scope.resolve(Modules.PRODUCT);
    const pricing = scope.resolve(Modules.PRICING);
    const link = scope.resolve(ContainerRegistrationKeys.LINK);

    // --- Idempotency: barcode (then SKU) already in catalog? ---
    const existing =
      (await productSvc.listProductVariants({ barcode: code }))[0] ??
      (await productSvc.listProductVariants({ sku: code }))[0];
    if (existing) {
      return ok(
        res,
        { already_exists: true, variant_id: existing.id, barcode: code, title: existing.title },
        200,
      );
    }

    // --- Create the product + single variant via the Product module ---
    const created = await productSvc.createProducts({
      title: productName,
      status: "published",
      handle: `${code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
      options: [{ title: "Variant", values: ["Default"] }],
      variants: [
        {
          title: productName,
          sku: code,
          barcode: code,
          manage_inventory: false,
          options: { Variant: "Default" },
          metadata: { price: amount, tax_rate: 0, category },
        },
      ],
      metadata: { category },
    });

    const product = Array.isArray(created) ? created[0] : created;
    const [variant] = await productSvc.listProductVariants({ product_id: product.id });

    // --- Attach a real price set so the admin pricing editor works ---
    const ps = await pricing.createPriceSets({
      prices: [{ amount, currency_code: "inr" }],
    });
    const priceSet = Array.isArray(ps) ? ps[0] : ps;
    await link.create({
      [Modules.PRODUCT]: { variant_id: variant.id },
      [Modules.PRICING]: { price_set_id: priceSet.id },
    });

    return ok(
      res,
      {
        product_id: product.id,
        variant_id: variant.id,
        title: product.title,
        barcode: code,
        price: amount,
      },
      201,
    );
  } catch (err) {
    return serverError(res, err);
  }
}
