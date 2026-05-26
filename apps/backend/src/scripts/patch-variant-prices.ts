import { Modules } from "@medusajs/framework/utils";

/**
 * Backfill: stamp each variant's display price into metadata.price so the POS
 * pull route can return it without going through the pricing/region pipeline.
 * Production deployments should compute prices via the pricing module; this
 * keeps the demo simple.
 */
const PRICE_BY_SKU_PREFIX: Record<string, number> = {
  "GVPS-BSH": 350, "GVPS-BPT": 450, "GVPS-GSK": 420, "GVPS-TIE": 120, "GVPS-BLT": 90,
  "ABCI-BSH": 400, "ABCI-BPT": 500, "ABCI-GSK": 480, "ABCI-TIE": 150,
};

export default async function patchPrices({ container }: { container: any }) {
  const productSvc = container.resolve(Modules.PRODUCT);
  const variants = await productSvc.listProductVariants({});

  let updated = 0;
  for (const v of variants) {
    const prefix = v.sku?.split("-").slice(0, 2).join("-");
    const price = PRICE_BY_SKU_PREFIX[prefix];
    if (!price) continue;
    await productSvc.updateProductVariants(v.id, {
      metadata: { ...(v.metadata ?? {}), price, tax_rate: 0.05 },
    });
    updated++;
  }
  console.log(`Stamped price/tax metadata on ${updated} variants`);
}
