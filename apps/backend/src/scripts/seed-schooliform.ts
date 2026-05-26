import { Modules } from "@medusajs/framework/utils";
import { MODULE_KEYS } from "../modules";

/**
 * Seed real Schooliform data (https://schooliform.com).
 *
 * Three schools, real prices from their public catalog:
 *   - JHH — Jain Heritage School Hebbal       (Fundamentals + Grades 1-12)
 *   - JHW — Jain Heritage School Whitefield   (Fundamentals + Grades 1-10)
 *   - JPS — Jain Public School Puttenhalli    (Grades 1-12)
 *
 * Distributor: Trail Blaze Retail Pvt Ltd, Basavanagudi, Bangalore.
 *
 * Wipes the previous demo schools (GVPS, ABCI) and their products before
 * creating fresh data. Idempotent: re-runs won't duplicate.
 */

interface ProductSpec {
  title: string;
  category: string;
  gender: "boy" | "girl" | "unisex";
  uniform_type: "regular" | "summer" | "winter" | "sports" | "house" | "formal";
  /** Variant sizes. Use ["F"] for free-size items (cap, belt, socks, bag). */
  sizes: string[];
  /** Price applied to every variant unless `price_by_size` is set. */
  price: number;
  /** Optional per-size override (used when small/larger sizes are priced differently). */
  price_by_size?: Record<string, number>;
  /** Minimum grade level this product is sold for (for context, doesn't gate anything). */
  available_from_grade?: number;
  sku_prefix: string;
}

interface SchoolSpec {
  code: string;
  name: string;
  city: string;
  area: string;
  phone: string;
  /** Class names exactly as the school uses them. */
  classes: string[];
  products: ProductSpec[];
  /** Sample kit composition (variant SKUs) for the auto-suggested kit. */
  sample_kit: { class_name: string; gender: "boy" | "girl" | "unisex"; uniform_type: string; item_skus: string[] };
}

const SCHOOLS: SchoolSpec[] = [
  {
    code: "JHH",
    name: "Jain Heritage School Hebbal",
    city: "Bangalore",
    area: "Hebbal",
    phone: "+91-9353236840",
    classes: [
      "Fundamentals", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12",
    ],
    products: [
      { title: "JHH Regular T-Shirt",   category: "T-Shirt", gender: "unisex", uniform_type: "regular", sizes: ["22","24","26","28","30","32","34"], price: 675, price_by_size: { "22": 500, "24": 500, "26": 625, "28": 675, "30": 700, "32": 725, "34": 725 }, sku_prefix: "JHH-RTS" },
      { title: "JHH Regular Full Pant", category: "Pant",    gender: "unisex", uniform_type: "regular", sizes: ["22","24","26","28","30","32","34"], price: 1225, price_by_size: { "22": 600, "24": 600, "26": 1200, "28": 1225, "30": 1250, "32": 1250, "34": 1250 }, sku_prefix: "JHH-RFP" },
      { title: "JHH Sports T-Shirt",    category: "T-Shirt", gender: "unisex", uniform_type: "sports",  sizes: ["S","M","L","XL"], price: 675, sku_prefix: "JHH-STS" },
      { title: "JHH Sports Track Pant", category: "Pant",    gender: "unisex", uniform_type: "sports",  sizes: ["S","M","L","XL"], price: 650, sku_prefix: "JHH-STP" },
      { title: "JHH Varsity Jacket",    category: "Jacket",  gender: "unisex", uniform_type: "winter",  sizes: ["S","M","L","XL"], price: 800, sku_prefix: "JHH-VJK" },
      { title: "JHH White Socks (1 set)", category: "Socks", gender: "unisex", uniform_type: "regular", sizes: ["F"], price: 100, sku_prefix: "JHH-SOX" },
      { title: "JHH White Socks (3 set)", category: "Socks", gender: "unisex", uniform_type: "regular", sizes: ["F"], price: 200, sku_prefix: "JHH-SX3" },
      { title: "JHH Cap",               category: "Cap",     gender: "unisex", uniform_type: "regular", sizes: ["F"], price: 200, sku_prefix: "JHH-CAP" },
      { title: "JHH Belt",              category: "Belt",    gender: "unisex", uniform_type: "regular", sizes: ["F"], price: 200, sku_prefix: "JHH-BLT" },
      { title: "JHH School Bag",        category: "Bag",     gender: "unisex", uniform_type: "regular", sizes: ["S","M","L"], price: 800, price_by_size: { "S": 650, "M": 800, "L": 1000 }, sku_prefix: "JHH-BAG" },
      { title: "JHH Campus Shoes",      category: "Shoes",   gender: "unisex", uniform_type: "regular", sizes: ["3","4","5","6","7","8","9","10"], price: 1150, sku_prefix: "JHH-SHO" },
    ],
    sample_kit: {
      class_name: "1", gender: "boy", uniform_type: "regular",
      item_skus: ["JHH-RTS-28", "JHH-RFP-28", "JHH-BLT-F", "JHH-SOX-F"],
    },
  },
  {
    code: "JHW",
    name: "Jain Heritage School Whitefield",
    city: "Bangalore",
    area: "Whitefield",
    phone: "+91-9620263270",
    classes: [
      "Fundamentals", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
    ],
    products: [
      { title: "JHW Regular T-Shirt",     category: "T-Shirt",     gender: "unisex", uniform_type: "regular", sizes: ["22","24","26","28","30","32"], price: 750, sku_prefix: "JHW-RTS" },
      { title: "JHW Regular Full Pant",   category: "Pant",        gender: "unisex", uniform_type: "regular", sizes: ["22","24","26","28","30","32"], price: 1250, sku_prefix: "JHW-RFP" },
      { title: "JHW Formal White Shirt",  category: "Shirt",       gender: "unisex", uniform_type: "formal",  sizes: ["28","30","32","34","36","38"], price: 700, sku_prefix: "JHW-FWS", available_from_grade: 5 },
      { title: "JHW Blazer",              category: "Blazer",      gender: "unisex", uniform_type: "formal",  sizes: ["28","30","32","34","36","38","40"], price: 2450, sku_prefix: "JHW-BLZ", available_from_grade: 5 },
      { title: "JHW House T-Shirt",       category: "T-Shirt",     gender: "unisex", uniform_type: "house",   sizes: ["S","M","L","XL"], price: 650, sku_prefix: "JHW-HTS" },
      { title: "JHW Sports Track Pant",   category: "Pant",        gender: "unisex", uniform_type: "sports",  sizes: ["S","M","L","XL"], price: 650, sku_prefix: "JHW-STP" },
      { title: "JHW Varsity Jacket",      category: "Jacket",      gender: "unisex", uniform_type: "winter",  sizes: ["S","M","L","XL"], price: 800, sku_prefix: "JHW-VJK" },
      { title: "JHW Denim Half Pant",     category: "Pant",        gender: "boy",    uniform_type: "regular", sizes: ["S","M","L"], price: 500, sku_prefix: "JHW-DHP" },
      { title: "JHW Denim Skirt",         category: "Skirt",       gender: "girl",   uniform_type: "regular", sizes: ["S","M","L"], price: 500, sku_prefix: "JHW-DSK" },
      { title: "JHW Fundamentals T-Shirt",category: "T-Shirt",     gender: "unisex", uniform_type: "regular", sizes: ["S","M","L"], price: 350, sku_prefix: "JHW-FTS" },
      { title: "JHW White Socks (1 set)", category: "Socks",       gender: "unisex", uniform_type: "regular", sizes: ["F"], price: 100, sku_prefix: "JHW-SOX" },
      { title: "JHW Cap",                 category: "Cap",         gender: "unisex", uniform_type: "regular", sizes: ["F"], price: 200, sku_prefix: "JHW-CAP" },
      { title: "JHW School Bag",          category: "Bag",         gender: "unisex", uniform_type: "regular", sizes: ["S","M","L"], price: 750, sku_prefix: "JHW-BAG" },
    ],
    sample_kit: {
      class_name: "1", gender: "boy", uniform_type: "regular",
      item_skus: ["JHW-RTS-26", "JHW-RFP-26", "JHW-SOX-F", "JHW-CAP-F"],
    },
  },
  {
    code: "JPS",
    name: "Jain Public School Puttenhalli",
    city: "Bangalore",
    area: "Puttenhalli",
    phone: "+91-9620319174",
    classes: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
    products: [
      { title: "JPS Yellow T-Shirt",      category: "T-Shirt", gender: "unisex", uniform_type: "regular", sizes: ["24","26","28","30","32","34"], price: 675, sku_prefix: "JPS-YTS" },
      { title: "JPS House T-Shirt",       category: "T-Shirt", gender: "unisex", uniform_type: "house",   sizes: ["24","26","28","30","32","34"], price: 525, sku_prefix: "JPS-HTS" },
      { title: "JPS Sports Track Pant",   category: "Pant",    gender: "unisex", uniform_type: "sports",  sizes: ["S","M","L","XL"], price: 625, sku_prefix: "JPS-STP" },
      { title: "JPS Formal Full Pant",    category: "Pant",    gender: "unisex", uniform_type: "formal",  sizes: ["28","30","32","34","36"], price: 1300, sku_prefix: "JPS-FFP", available_from_grade: 6 },
      { title: "JPS Formal White Shirt",  category: "Shirt",   gender: "unisex", uniform_type: "formal",  sizes: ["28","30","32","34","36"], price: 700, sku_prefix: "JPS-FWS", available_from_grade: 6 },
      { title: "JPS Blazer",              category: "Blazer",  gender: "unisex", uniform_type: "formal",  sizes: ["28","30","32","34","36","38"], price: 2500, sku_prefix: "JPS-BLZ", available_from_grade: 6 },
      { title: "JPS Sweater",             category: "Sweater", gender: "unisex", uniform_type: "winter",  sizes: ["S","M","L","XL"], price: 725, sku_prefix: "JPS-SWT" },
      { title: "JPS School Bag",          category: "Bag",     gender: "unisex", uniform_type: "regular", sizes: ["S","M","L"], price: 750, sku_prefix: "JPS-BAG" },
      { title: "JPS Navy Blue Socks (1)", category: "Socks",   gender: "unisex", uniform_type: "regular", sizes: ["F"], price: 100, sku_prefix: "JPS-SOX" },
      { title: "JPS Navy Blue Socks (3)", category: "Socks",   gender: "unisex", uniform_type: "regular", sizes: ["F"], price: 200, sku_prefix: "JPS-SX3" },
      { title: "JPS Campus Shoes",        category: "Shoes",   gender: "unisex", uniform_type: "regular", sizes: ["3","4","5","6","7","8","9","10"], price: 1150, sku_prefix: "JPS-SHO" },
    ],
    // The JPS senior kit (Class 6+) uses formal pieces; we tag it as `regular`
    // on the kit row because the UniformKit model's uniform_type enum doesn't
    // include "formal" (matches spec § 7.4). Products still carry
    // category=Formal in their own metadata.
    sample_kit: {
      class_name: "6", gender: "unisex", uniform_type: "regular",
      item_skus: ["JPS-FWS-30", "JPS-FFP-30", "JPS-BLZ-30", "JPS-SOX-F"],
    },
  },
];

const DEMO_SCHOOL_CODES = ["GVPS", "ABCI", "JHH", "JHW", "JPS"];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default async function seedSchooliform({ container }: { container: any }) {
  const schoolSvc = container.resolve(MODULE_KEYS.SCHOOL);
  const kitSvc = container.resolve(MODULE_KEYS.UNIFORM_KIT);
  const productSvc = container.resolve(Modules.PRODUCT);

  // 1. Wipe demo data --------------------------------------------------------
  console.log("Cleaning demo schools (GVPS, ABCI) and their products...");
  for (const code of DEMO_SCHOOL_CODES) {
    const [school] = await schoolSvc.listSchools({ code });
    if (!school) continue;
    const oldClasses = await schoolSvc.listSchoolClasses({ school_id: school.id });
    const oldKits = await kitSvc.listUniformKits({ school_id: school.id });
    const oldRules = await kitSvc.listUniformRules({ school_id: school.id });
    // Delete rules + kit items + kits first.
    for (const r of oldRules) await kitSvc.deleteUniformRules(r.id);
    for (const k of oldKits) {
      const items = await kitSvc.listUniformKitItems({ kit_id: k.id });
      for (const it of items) await kitSvc.deleteUniformKitItems(it.id);
      await kitSvc.deleteUniformKits(k.id);
    }
    for (const cls of oldClasses) await schoolSvc.deleteSchoolClasses(cls.id);
    await schoolSvc.deleteSchools(school.id);
    console.log(`  Removed ${code}: ${oldClasses.length} classes, ${oldKits.length} kits`);
  }
  // Delete Medusa products whose SKU prefix matches the demo+seeded schools.
  for (const prefix of ["GVPS-", "ABCI-", "JHH-", "JHW-", "JPS-"]) {
    const variants = await productSvc.listProductVariants({});
    const matching = variants.filter((v: any) => v.sku?.startsWith(prefix));
    const productIds = new Set<string>(matching.map((v: any) => v.product_id));
    for (const pid of productIds) {
      try {
        await productSvc.deleteProducts(pid);
      } catch {
        /* cascade delete may already handle children */
      }
    }
    console.log(`  Removed ${productIds.size} demo products with prefix ${prefix}`);
  }

  // 2. Ensure an active academic year ---------------------------------------
  let year = await schoolSvc.getActiveAcademicYear();
  if (!year) {
    year = await schoolSvc.createAcademicYears({
      name: "2026-2027",
      start_date: new Date("2026-06-01"),
      end_date: new Date("2027-05-31"),
      is_active: true,
    });
    console.log(`Created academic year 2026-2027`);
  }

  // 3. Create schools, classes, products, kits, rules ------------------------
  for (const s of SCHOOLS) {
    const school = await schoolSvc.createSchools({
      name: s.name,
      code: s.code,
      city: s.city,
      area: s.area,
      phone: s.phone,
      email: "info@schooliform.com",
      status: "active",
    });
    console.log(`\nCreated ${s.code} — ${s.name}`);

    // Classes
    const classRecords: Record<string, any> = {};
    for (let i = 0; i < s.classes.length; i++) {
      const cls = await schoolSvc.createSchoolClasses({
        school_id: school.id,
        class_name: s.classes[i],
        academic_year_id: year.id,
        display_order: i,
        status: "active",
      });
      classRecords[s.classes[i]] = cls;
    }
    console.log(`  ${s.classes.length} classes`);

    // Products + variants
    const variantsBySku: Record<string, any> = {};
    for (const p of s.products) {
      const product = await productSvc.createProducts({
        title: p.title,
        status: "published",
        handle: slugify(p.title),
        options: [{ title: "Size", values: p.sizes }],
        variants: p.sizes.map((size) => {
          const price = p.price_by_size?.[size] ?? p.price;
          return {
            title: `${p.title} ${size}`,
            sku: `${p.sku_prefix}-${size}`,
            barcode: `${p.sku_prefix}-${size}`,
            manage_inventory: true,
            options: { Size: size },
            metadata: {
              price,
              tax_rate: 0.05,
              size,
              gender: p.gender,
              school_id: school.id,
              school_code: school.code,
              category: p.category,
              uniform_type: p.uniform_type,
              available_from_grade: p.available_from_grade ?? null,
            },
          };
        }),
        metadata: {
          school_id: school.id,
          school_code: school.code,
          category: p.category,
          gender: p.gender,
          uniform_type: p.uniform_type,
        },
      });
      const prod = Array.isArray(product) ? product[0] : product;
      const variants = await productSvc.listProductVariants({ product_id: prod.id });
      for (const v of variants) variantsBySku[v.sku] = v;
    }
    console.log(`  ${s.products.length} products, ${Object.keys(variantsBySku).length} variants`);

    // Sample kit + rule
    const kit = await kitSvc.createUniformKits({
      name: `${s.code} ${s.sample_kit.class_name} ${s.sample_kit.gender} ${s.sample_kit.uniform_type}`,
      school_id: school.id,
      class_id: classRecords[s.sample_kit.class_name]?.id,
      gender: s.sample_kit.gender,
      uniform_type: s.sample_kit.uniform_type,
      academic_year_id: year.id,
      status: "active",
    });
    let order = 0;
    for (const sku of s.sample_kit.item_skus) {
      const variant = variantsBySku[sku];
      if (!variant) {
        console.warn(`  Kit item ${sku} not found — skipping`);
        continue;
      }
      await kitSvc.createUniformKitItems({
        kit_id: kit.id,
        product_variant_id: variant.id,
        quantity: 1,
        is_required: true,
        sort_order: order++,
      });
    }
    await kitSvc.createUniformRules({
      school_id: school.id,
      class_id: classRecords[s.sample_kit.class_name]?.id,
      gender: s.sample_kit.gender,
      uniform_type: s.sample_kit.uniform_type,
      academic_year_id: year.id,
      kit_id: kit.id,
    });
    console.log(`  Kit "${kit.name}" with ${order} items + rule`);
  }

  console.log("\n✓ Schooliform seed complete. Three schools live with real prices.");
}
