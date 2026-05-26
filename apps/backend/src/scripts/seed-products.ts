import { Modules } from "@medusajs/framework/utils";
import { MODULE_KEYS } from "../modules";

/**
 * Seed a handful of school-uniform products so the POS billing screen has
 * something real to scan and sell. Idempotent: re-running won't duplicate.
 *
 * For each school (GVPS, ABCI) we create:
 *   - Boys Shirt   (sizes 26, 28, 30)
 *   - Boys Pant    (sizes 26, 28, 30)
 *   - Girls Skirt  (sizes 22, 24, 26)
 *   - Tie (unisex, one size)
 *
 * Plus one kit per school for Class 1 Boys Regular, and a UniformRule that
 * maps (school, class 1, boy, regular) -> that kit. Inventory: 50 units per
 * variant at the default stock location.
 */
export default async function seedProducts({ container }: { container: any }) {
  const productSvc = container.resolve(Modules.PRODUCT);
  const stockLocSvc = container.resolve(Modules.STOCK_LOCATION);
  const inventorySvc = container.resolve(Modules.INVENTORY);
  const schoolSvc = container.resolve(MODULE_KEYS.SCHOOL);
  const kitSvc = container.resolve(MODULE_KEYS.UNIFORM_KIT);

  // 0. Ensure we have a stock location.
  let [stockLoc] = await stockLocSvc.listStockLocations({ name: "Main Counter" });
  if (!stockLoc) {
    stockLoc = await stockLocSvc.createStockLocations({
      name: "Main Counter",
      address: {
        address_1: "Distributor HQ",
        country_code: "in",
        city: "Pune",
      },
    });
  }
  console.log(`Stock location: ${stockLoc.name} (${stockLoc.id})`);

  // 1. Look up schools created by the earlier seed.
  const schools = await schoolSvc.listSchools({}, { order: { code: "ASC" } });
  if (schools.length === 0) {
    throw new Error("No schools found — run the main seed first.");
  }

  // 2. Look up active classes for each school (we need class IDs for the kit).
  const activeYear = await schoolSvc.getActiveAcademicYear();

  type ProductBlueprint = {
    title: string;
    category: string;
    gender: "boy" | "girl" | "unisex";
    sizes: string[];
    base_price: number;
    base_barcode_prefix: string;
  };

  const blueprintsByCode: Record<string, ProductBlueprint[]> = {
    GVPS: [
      { title: "GVPS Boys Shirt",  category: "Shirt", gender: "boy",    sizes: ["26", "28", "30"], base_price: 350, base_barcode_prefix: "GVPS-BSH" },
      { title: "GVPS Boys Pant",   category: "Pant",  gender: "boy",    sizes: ["26", "28", "30"], base_price: 450, base_barcode_prefix: "GVPS-BPT" },
      { title: "GVPS Girls Skirt", category: "Skirt", gender: "girl",   sizes: ["22", "24", "26"], base_price: 420, base_barcode_prefix: "GVPS-GSK" },
      { title: "GVPS Tie",         category: "Tie",   gender: "unisex", sizes: ["F"],              base_price: 120, base_barcode_prefix: "GVPS-TIE" },
      { title: "GVPS Belt",        category: "Belt",  gender: "unisex", sizes: ["F"],              base_price: 90,  base_barcode_prefix: "GVPS-BLT" },
    ],
    ABCI: [
      { title: "ABCI Boys Shirt",  category: "Shirt", gender: "boy",    sizes: ["26", "28", "30"], base_price: 400, base_barcode_prefix: "ABCI-BSH" },
      { title: "ABCI Boys Pant",   category: "Pant",  gender: "boy",    sizes: ["26", "28", "30"], base_price: 500, base_barcode_prefix: "ABCI-BPT" },
      { title: "ABCI Girls Skirt", category: "Skirt", gender: "girl",   sizes: ["22", "24", "26"], base_price: 480, base_barcode_prefix: "ABCI-GSK" },
      { title: "ABCI Tie",         category: "Tie",   gender: "unisex", sizes: ["F"],              base_price: 150, base_barcode_prefix: "ABCI-TIE" },
    ],
  };

  const createdVariants: Array<{ variant_id: string; sku: string; product_title: string }> = [];

  for (const school of schools) {
    const blueprints = blueprintsByCode[school.code];
    if (!blueprints) continue;

    for (const bp of blueprints) {
      const sku = `${bp.base_barcode_prefix}-${bp.sizes[0]}`;
      // Idempotency: skip if any variant with this SKU already exists.
      const [existingVariant] = await productSvc.listProductVariants({ sku });
      if (existingVariant) {
        console.log(`Skip ${bp.title} (already seeded, variant ${sku})`);
        for (const size of bp.sizes) {
          const s = `${bp.base_barcode_prefix}-${size}`;
          const [v] = await productSvc.listProductVariants({ sku: s });
          if (v) createdVariants.push({ variant_id: v.id, sku: s, product_title: bp.title });
        }
        continue;
      }

      const product = await productSvc.createProducts({
        title: bp.title,
        status: "published",
        handle: bp.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        options: [{ title: "Size", values: bp.sizes }],
        variants: bp.sizes.map((size) => ({
          title: `${bp.title} ${size}`,
          sku: `${bp.base_barcode_prefix}-${size}`,
          barcode: `${bp.base_barcode_prefix}-${size}`,
          manage_inventory: true,
          options: { Size: size },
          metadata: {
            size,
            gender: bp.gender,
            school_id: school.id,
            school_code: school.code,
            category: bp.category,
            uniform_type: "regular",
          },
          prices: [{ amount: bp.base_price, currency_code: "inr" }],
        })),
        metadata: {
          school_id: school.id,
          category: bp.category,
          gender: bp.gender,
          uniform_type: "regular",
        },
      });
      const prod = Array.isArray(product) ? product[0] : product;
      const variants = await productSvc.listProductVariants({ product_id: prod.id });
      console.log(`Created ${bp.title} with ${variants.length} variants`);
      for (const v of variants) {
        createdVariants.push({ variant_id: v.id, sku: v.sku, product_title: bp.title });
      }
    }
  }

  // 3. Add inventory levels so local_available_quantity isn't 0 on the POS.
  //    Medusa v2 inventory is keyed by inventory_item_id which is linked to variants
  //    via product_variant_inventory_item join table. The Link module wires this up.
  //    For simplicity we just attempt to set 50 units on each variant's auto-created
  //    inventory item; if the link isn't established we log and skip.
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
        // Either create or update the level for our stock location.
        const [level] = await inventorySvc.listInventoryLevels({
          inventory_item_id: inventoryItemId,
          location_id: stockLoc.id,
        });
        if (level) {
          await inventorySvc.updateInventoryLevels([
            { id: level.id, stocked_quantity: 50 },
          ]);
        } else {
          await inventorySvc.createInventoryLevels({
            inventory_item_id: inventoryItemId,
            location_id: stockLoc.id,
            stocked_quantity: 50,
            reserved_quantity: 0,
          });
        }
      }
    } catch (err) {
      console.warn(`Inventory setup skipped for ${v.sku}: ${(err as Error).message}`);
    }
  }

  // 4. Create a sample kit for Green Valley Class 1 Boys Regular.
  const gvps = schools.find((s: any) => s.code === "GVPS");
  if (gvps && activeYear) {
    const [class1] = await schoolSvc.listSchoolClasses({
      school_id: gvps.id,
      class_name: "1",
    });
    if (class1) {
      const existing = await kitSvc.listUniformKits({
        school_id: gvps.id,
        class_id: class1.id,
        gender: "boy",
        uniform_type: "regular",
      });
      if (existing.length === 0) {
        const kitItems = createdVariants
          .filter((v) =>
            v.product_title === "GVPS Boys Shirt" ||
            v.product_title === "GVPS Boys Pant" ||
            v.product_title === "GVPS Tie" ||
            v.product_title === "GVPS Belt",
          )
          .filter((v) => v.sku.endsWith("-28") || v.sku.endsWith("-F"));

        const kit = await kitSvc.createUniformKits({
          name: "GVPS Class 1 Boys Regular",
          school_id: gvps.id,
          class_id: class1.id,
          gender: "boy",
          uniform_type: "regular",
          academic_year_id: activeYear.id,
          status: "active",
        });

        // Items
        let sortOrder = 0;
        for (const item of kitItems) {
          await kitSvc.createUniformKitItems({
            kit_id: kit.id,
            product_variant_id: item.variant_id,
            quantity: 1,
            is_required: true,
            sort_order: sortOrder++,
          });
        }

        // Rule that triggers kit suggestion on the POS billing screen.
        await kitSvc.createUniformRules({
          school_id: gvps.id,
          class_id: class1.id,
          gender: "boy",
          uniform_type: "regular",
          academic_year_id: activeYear.id,
          kit_id: kit.id,
        });

        console.log(`Created kit "${kit.name}" with ${kitItems.length} items + rule`);
      } else {
        console.log("Kit for GVPS Class 1 Boys Regular already exists, skipping");
      }
    }
  }

  console.log(`\nDone. Created/verified ${createdVariants.length} variants across ${schools.length} schools.`);
}
