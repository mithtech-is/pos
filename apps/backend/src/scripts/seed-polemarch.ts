import { Modules } from "@medusajs/framework/utils";
import { MODULE_KEYS } from "../modules";

/**
 * Seed Polemarch unlisted-share scrips for the pivoted POS.
 *
 * What this does:
 *   1. Wipes any pre-existing schools / products / variants / kits / rules
 *      from the previous school-uniform tenant.
 *   2. Creates a single "issuer" placeholder school called "Polemarch
 *      Listings" so the POS schema (which requires school_id on products)
 *      keeps working without invasive refactors.
 *   3. Seeds 15 well-known unlisted Indian companies pulled from
 *      polemarch.in/invest with their current quoted share price.
 *   4. Each company gets one product + one variant. The variant SKU is the
 *      ISIN (so scanning it works), the price is the per-share quote, and
 *      stocked_quantity is set to 10000 shares so the cashier-side stock
 *      check doesn't block trades.
 *
 * Run after the main seed has set up infra (academic year, stock location):
 *   npm --workspace apps/backend run -- medusa exec ./src/scripts/seed-polemarch.ts
 */

interface ScripBlueprint {
  name: string;
  isin: string;
  price: number;
  sector: string;
  description: string;
}

const SCRIPS: ScripBlueprint[] = [
  {
    name: "National Stock Exchange of India",
    isin: "INE721I01024",
    price: 1995,
    sector: "Banking & Investment Services",
    description:
      "India's largest stock exchange by equity trading volume, operator of Nifty indices.",
  },
  {
    name: "HDFC Securities",
    isin: "INE700G01014",
    price: 8650,
    sector: "Banking & Investment Services",
    description:
      "Retail and institutional broking arm of HDFC Bank.",
  },
  {
    name: "Imagine Marketing (boAt)",
    isin: "INE03AV01027",
    price: 895,
    sector: "Technology Equipment",
    description:
      "Leading consumer electronics brand for audio, wearables and grooming.",
  },
  {
    name: "Nayara Energy",
    isin: "INE011A01019",
    price: 1124,
    sector: "Energy — Fossil Fuels",
    description:
      "Integrated downstream oil and refining company (formerly Essar Oil).",
  },
  {
    name: "SBI Funds Management",
    isin: "INE640G01020",
    price: 768,
    sector: "Asset Management",
    description:
      "AMC behind SBI Mutual Fund, India's largest mutual fund house by AUM.",
  },
  {
    name: "NCDEX",
    isin: "INE127G01010",
    price: 372,
    sector: "Banking & Investment Services",
    description:
      "National Commodity & Derivatives Exchange — agri-commodity futures.",
  },
  {
    name: "Capgemini Technology Services India",
    isin: "INE177B01032",
    price: 11250,
    sector: "Software & IT Services",
    description:
      "Indian subsidiary of Capgemini SE, global IT services and consulting.",
  },
  {
    name: "Chennai Super Kings Cricket",
    isin: "INE852S01026",
    price: 258,
    sector: "Sports & Entertainment",
    description:
      "Owns and operates the Chennai Super Kings IPL franchise.",
  },
  {
    name: "Oravel Stays (OYO)",
    isin: "INE561T01021",
    price: 23,
    sector: "Cyclical Consumer Services",
    description:
      "Hospitality platform parent of the OYO brand, operating across 35+ countries.",
  },
  {
    name: "Zepto",
    isin: "INE143401029",
    price: 48,
    sector: "Quick Commerce",
    description:
      "10-minute grocery delivery platform serving major Indian metros.",
  },
  {
    name: "Mohan Meakin (Old Monk)",
    isin: "INE136D01018",
    price: 2225,
    sector: "Food & Beverages",
    description:
      "One of India's oldest distilleries (est. 1855), famous for Old Monk rum.",
  },
  {
    name: "B9 Beverages (Bira 91)",
    isin: "INE833U01014",
    price: 73.76,
    sector: "Food & Beverages",
    description:
      "Craft beer brand with lagers, IPAs and witbiers under the Bira 91 label.",
  },
  {
    name: "Hero FinCorp",
    isin: "INE957N01016",
    price: 1066,
    sector: "Banking & Investment Services",
    description:
      "Hero Group's NBFC arm for two-wheeler and MSME financing.",
  },
  {
    name: "Garuda Aerospace",
    isin: "INE0REL01013",
    price: 470.3,
    sector: "Industrial Goods (Drones)",
    description:
      "Chennai-headquartered drone manufacturer with ~50% share of India's agri-drone segment.",
  },
  {
    name: "Philips India",
    isin: "INE319A01016",
    price: 1160,
    sector: "Healthcare Services & Equipment",
    description:
      "Indian subsidiary of Royal Philips with consumer health, lighting and personal-care products.",
  },
];

const ISSUER_NAME = "Polemarch Listings";
const ISSUER_CODE = "PMC";
const POL_STOCK_LOC = "Polemarch Vault";
const PER_LOT_STOCK = 10000; // shares available on the book

export default async function seedPolemarch({ container }: { container: any }) {
  const productSvc = container.resolve(Modules.PRODUCT);
  const stockLocSvc = container.resolve(Modules.STOCK_LOCATION);
  const inventorySvc = container.resolve(Modules.INVENTORY);
  const schoolSvc = container.resolve(MODULE_KEYS.SCHOOL);
  const kitSvc = container.resolve(MODULE_KEYS.UNIFORM_KIT);

  // ─── 1. WIPE legacy uniform data ──────────────────────────────────────
  console.log("Wiping legacy uniform data…");

  // Remove uniform rules + kits first (FKs to school + product).
  try {
    const rules = await kitSvc.listUniformRules({});
    if (rules?.length) {
      await kitSvc.deleteUniformRules(rules.map((r: any) => r.id));
      console.log(`  · deleted ${rules.length} uniform rules`);
    }
  } catch (err) {
    console.warn(`  · uniform-rule cleanup skipped: ${(err as Error).message}`);
  }

  try {
    const kits = await kitSvc.listUniformKits({});
    if (kits?.length) {
      await kitSvc.deleteUniformKits(kits.map((k: any) => k.id));
      console.log(`  · deleted ${kits.length} uniform kits (with items)`);
    }
  } catch (err) {
    console.warn(`  · kit cleanup skipped: ${(err as Error).message}`);
  }

  // Drop EVERY existing product — they're all from the uniform tenant.
  try {
    const allProducts = await productSvc.listProducts({}, { take: 1000 });
    if (allProducts.length) {
      await productSvc.deleteProducts(allProducts.map((p: any) => p.id));
      console.log(`  · deleted ${allProducts.length} legacy products + variants`);
    }
  } catch (err) {
    console.warn(`  · product cleanup skipped: ${(err as Error).message}`);
  }

  // Drop all schools + classes from the uniform tenant.
  try {
    const allClasses = await schoolSvc.listSchoolClasses({});
    if (allClasses?.length) {
      await schoolSvc.deleteSchoolClasses(allClasses.map((c: any) => c.id));
      console.log(`  · deleted ${allClasses.length} school classes`);
    }
  } catch (err) {
    console.warn(`  · class cleanup skipped: ${(err as Error).message}`);
  }

  try {
    const allSchools = await schoolSvc.listSchools({});
    if (allSchools?.length) {
      await schoolSvc.deleteSchools(allSchools.map((s: any) => s.id));
      console.log(`  · deleted ${allSchools.length} schools`);
    }
  } catch (err) {
    console.warn(`  · school cleanup skipped: ${(err as Error).message}`);
  }

  // ─── 2. Create stock location for Polemarch ───────────────────────────
  let [stockLoc] = await stockLocSvc.listStockLocations({ name: POL_STOCK_LOC });
  if (!stockLoc) {
    stockLoc = await stockLocSvc.createStockLocations({
      name: POL_STOCK_LOC,
      address: {
        address_1: "BKC, Bandra East",
        country_code: "in",
        city: "Mumbai",
      },
    });
  }
  console.log(`Stock location ready: ${stockLoc.name} (${stockLoc.id})`);

  // ─── 3. Issuer placeholder school (the schema currently requires a
  //    school_id on every product; we use one synthetic row to satisfy that
  //    constraint while keeping the UI clean). ────────────────────────────
  const issuer = await schoolSvc.createSchools({
    name: ISSUER_NAME,
    code: ISSUER_CODE,
    city: "Mumbai",
    status: "active",
  });
  console.log(`Issuer row: ${issuer.name} (${issuer.id})`);

  // ─── 4. Create one product + one variant per scrip ────────────────────
  const createdVariants: { variant_id: string; isin: string }[] = [];
  for (const s of SCRIPS) {
    const product = await productSvc.createProducts({
      title: s.name,
      status: "published",
      description: s.description,
      handle: s.isin.toLowerCase(),
      metadata: {
        isin: s.isin,
        sector: s.sector,
        school_id: issuer.id,
        listing_type: "unlisted_equity",
      },
      options: [{ title: "Lot", values: ["1 share"] }],
      variants: [
        {
          title: s.name,
          sku: s.isin,
          barcode: s.isin,
          manage_inventory: true,
          options: { Lot: "1 share" },
          metadata: {
            isin: s.isin,
            sector: s.sector,
            school_id: issuer.id,
            school_code: ISSUER_CODE,
            category: "unlisted_equity",
            uniform_type: s.sector, // re-purposed as the sector tag
            // The sync route reads `metadata.price` and `metadata.tax_rate`
            // directly (see apps/backend/src/api/pos/sync/pull/route.ts) —
            // setting them here is what makes the price visible in the POS.
            price: s.price,
            tax_rate: 0,
            size: "1 share",
          },
          prices: [{ amount: s.price, currency_code: "inr" }],
        },
      ],
    });

    const prod = Array.isArray(product) ? product[0] : product;
    const variants = await productSvc.listProductVariants({ product_id: prod.id });
    for (const v of variants) {
      createdVariants.push({ variant_id: v.id, isin: s.isin });
    }
    console.log(`  ✓ ${s.name}  (${s.isin})  ₹${s.price}`);
  }

  // ─── 5. Set inventory levels so the POS stock check doesn't block ─────
  console.log("Setting inventory levels…");
  for (const v of createdVariants) {
    try {
      const [variant] = await productSvc.listProductVariants(
        { id: v.variant_id },
        { relations: ["inventory_items"] },
      );
      const items = variant?.inventory_items ?? [];
      for (const link of items) {
        const inventoryItemId = link.inventory?.id ?? link.inventory_item_id ?? link.id;
        if (!inventoryItemId) continue;
        const [level] = await inventorySvc.listInventoryLevels({
          inventory_item_id: inventoryItemId,
          location_id: stockLoc.id,
        });
        if (level) {
          await inventorySvc.updateInventoryLevels([
            { id: level.id, stocked_quantity: PER_LOT_STOCK },
          ]);
        } else {
          await inventorySvc.createInventoryLevels({
            inventory_item_id: inventoryItemId,
            location_id: stockLoc.id,
            stocked_quantity: PER_LOT_STOCK,
            reserved_quantity: 0,
          });
        }
      }
    } catch (err) {
      console.warn(`  · inventory skipped for ${v.isin}: ${(err as Error).message}`);
    }
  }

  console.log(`\nDone. ${SCRIPS.length} unlisted scrips seeded under issuer "${ISSUER_NAME}".`);
  console.log(`Next step: from the Polemarch POS, hit Sync → "Pull now" so the local cache picks them up.`);
}
