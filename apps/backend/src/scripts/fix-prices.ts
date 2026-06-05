import { Modules, ContainerRegistrationKeys } from "@medusajs/framework/utils";

/**
 * Backfill real pricing-module prices for every product variant.
 *
 * Why this exists: seed-polemarch.ts created products via the Product MODULE
 * service (productSvc.createProducts), which silently ignores the `prices`
 * field — in Medusa v2 prices live in the separate Pricing module and only the
 * createProductsWorkflow wires them up. So variants ended up with a
 * `metadata.price` (used by the POS sync route) but NO price set. The admin
 * pricing editor then crashes ("Cannot read properties of undefined (reading
 * 'reduce')") because it expects every variant to have a price set.
 *
 * This script:
 *   1. Makes the store support INR (default) — the app is rupee-denominated.
 *   2. For each variant with no price set, creates one from metadata.price
 *      (currency INR) and links it to the variant.
 *
 * Idempotent: variants that already have a price set are skipped, so it's safe
 * to re-run.
 */
export default async function fixPrices({ container }: { container: any }) {
  const storeSvc = container.resolve(Modules.STORE);
  const pricing = container.resolve(Modules.PRICING);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  // 1. Ensure the store is denominated in INR.
  const [store] = await storeSvc.listStores();
  await storeSvc.updateStores(store.id, {
    supported_currencies: [{ currency_code: "inr", is_default: true }],
  });
  console.log(`Store ${store.id}: supported currencies -> INR (default)`);

  // 2. Fetch variants together with any existing price set link.
  const { data: variants } = await query.graph({
    entity: "product_variant",
    fields: ["id", "sku", "metadata", "price_set.id"],
  });

  let created = 0;
  let skipped = 0;
  for (const v of variants) {
    if (v.price_set?.id) {
      skipped++;
      continue;
    }
    const amount = Number(v.metadata?.price);
    if (!amount || Number.isNaN(amount)) {
      console.log(`  · ${v.sku}: no usable metadata.price, skipped`);
      skipped++;
      continue;
    }

    const res = await pricing.createPriceSets({
      prices: [{ amount, currency_code: "inr" }],
    });
    const priceSet = Array.isArray(res) ? res[0] : res;

    await link.create({
      [Modules.PRODUCT]: { variant_id: v.id },
      [Modules.PRICING]: { price_set_id: priceSet.id },
    });
    created++;
    console.log(`  ✓ ${v.sku}: ₹${amount} price set linked`);
  }

  console.log(`Done. Created ${created} price sets, skipped ${skipped}.`);
}
