import { Modules } from "@medusajs/framework/utils";
import { MODULE_KEYS } from "../modules";

type CatalogProduct = {
  title: string;
  category: string;
  variants: Array<{ label: string; sku: string; barcode: string; price: number }>;
};

const PRODUCTS: CatalogProduct[] = [
  {
    title: "Classic T-Shirt",
    category: "Apparel",
    variants: [
      { label: "S", sku: "CF-TEE-S", barcode: "CF-TEE-S", price: 499 },
      { label: "M", sku: "CF-TEE-M", barcode: "CF-TEE-M", price: 499 },
      { label: "L", sku: "CF-TEE-L", barcode: "CF-TEE-L", price: 499 },
    ],
  },
  {
    title: "Everyday Shirt",
    category: "Apparel",
    variants: [
      { label: "M", sku: "CF-SHIRT-M", barcode: "CF-SHIRT-M", price: 899 },
      { label: "L", sku: "CF-SHIRT-L", barcode: "CF-SHIRT-L", price: 899 },
    ],
  },
  {
    title: "Work Pants",
    category: "Apparel",
    variants: [
      { label: "32", sku: "CF-PANTS-32", barcode: "CF-PANTS-32", price: 1199 },
      { label: "34", sku: "CF-PANTS-34", barcode: "CF-PANTS-34", price: 1199 },
    ],
  },
  {
    title: "Canvas Tote",
    category: "Accessories",
    variants: [
      { label: "Standard", sku: "CF-TOTE-STD", barcode: "CF-TOTE-STD", price: 349 },
    ],
  },
  {
    title: "Steel Bottle",
    category: "Accessories",
    variants: [
      { label: "750 ml", sku: "CF-BOTTLE-750", barcode: "CF-BOTTLE-750", price: 649 },
    ],
  },
  {
    title: "Notebook Pack",
    category: "Stationery",
    variants: [
      { label: "3 Pack", sku: "CF-NOTEBOOK-3", barcode: "CF-NOTEBOOK-3", price: 199 },
    ],
  },
];

export default async function seedCounterflowProducts({ container }: { container: any }) {
  const productSvc = container.resolve(Modules.PRODUCT);
  const stockLocSvc = container.resolve(Modules.STOCK_LOCATION);
  const inventorySvc = container.resolve(Modules.INVENTORY);
  const outletSvc = container.resolve(MODULE_KEYS.SCHOOL);
  const deviceSvc = container.resolve(MODULE_KEYS.POS_DEVICE);

  let [year] = await outletSvc.listAcademicYears({ is_active: true });
  if (!year) {
    year = await outletSvc.createAcademicYears({
      name: "Default",
      start_date: new Date("2026-01-01"),
      end_date: new Date("2026-12-31"),
      is_active: true,
    });
  }

  let [outlet] = await outletSvc.listSchools({ code: "MAIN" });
  if (!outlet) {
    outlet = await outletSvc.createSchools({
      name: "Main Outlet",
      code: "MAIN",
      city: "Local",
      status: "active",
    });
  }

  // Second outlet so multi-store is demonstrable out of the box.
  const [branch2] = await outletSvc.listSchools({ code: "BR2" });
  if (!branch2) {
    await outletSvc.createSchools({
      name: "Branch 2",
      code: "BR2",
      city: "Local",
      status: "active",
    });
  }

  const [existingGroup] = await outletSvc.listSchoolClasses({
    school_id: outlet.id,
    class_name: "Default",
  });
  if (!existingGroup) {
    await outletSvc.createSchoolClasses({
      school_id: outlet.id,
      class_name: "Default",
      academic_year_id: year.id,
      display_order: 1,
      status: "active",
    });
  }

  let [stockLoc] = await stockLocSvc.listStockLocations({ name: "Main Outlet" });
  if (!stockLoc) {
    stockLoc = await stockLocSvc.createStockLocations({
      name: "Main Outlet",
      address: {
        address_1: "Main branch",
        country_code: "in",
        city: "Local",
      },
    });
  }

  await deviceSvc.registerDevice({
    device_code: "POS001",
    device_name: "Main Counter",
    store_location_id: stockLoc.id,
  });

  const variantIds: string[] = [];

  for (const item of PRODUCTS) {
    const [existingProduct] = await productSvc.listProducts({ title: item.title });
    if (existingProduct) {
      const variants = await productSvc.listProductVariants({ product_id: existingProduct.id });
      variantIds.push(...variants.map((v: any) => v.id));
      continue;
    }

    const created = await productSvc.createProducts({
      title: item.title,
      status: "published",
      handle: item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      options: [{ title: "Option", values: item.variants.map((v) => v.label) }],
      variants: item.variants.map((variant) => ({
        title: `${item.title} ${variant.label}`,
        sku: variant.sku,
        barcode: variant.barcode,
        // Always sellable: no per-variant inventory wiring needed for the demo
        // catalog (avoids "out of stock" when stock levels aren't seeded).
        manage_inventory: false,
        options: { Option: variant.label },
        metadata: {
          price: variant.price,
          tax_rate: 0,
          size: variant.label,
          gender: "unisex",
          school_id: outlet.id,
          school_code: outlet.code,
          category: item.category,
          uniform_type: "default",
          stock_on_hand: 50,
          reorder_point: 10,
        },
        prices: [{ amount: variant.price, currency_code: "inr" }],
      })),
      metadata: {
        school_id: outlet.id,
        category: item.category,
        gender: "unisex",
        uniform_type: "default",
      },
    });

    const product = Array.isArray(created) ? created[0] : created;
    const variants = await productSvc.listProductVariants({ product_id: product.id });
    variantIds.push(...variants.map((v: any) => v.id));
    console.log(`Created ${item.title} (${variants.length} variants)`);
  }

  for (const variantId of variantIds) {
    try {
      const [variant] = await productSvc.listProductVariants(
        { id: variantId },
        { relations: ["inventory_items"] },
      );
      for (const link of variant?.inventory_items ?? []) {
        const inventoryItemId = link.inventory?.id ?? link.inventory_item_id ?? link.id;
        if (!inventoryItemId) continue;
        const [level] = await inventorySvc.listInventoryLevels({
          inventory_item_id: inventoryItemId,
          location_id: stockLoc.id,
        });
        if (level) {
          await inventorySvc.updateInventoryLevels([{ id: level.id, stocked_quantity: 100 }]);
        } else {
          await inventorySvc.createInventoryLevels({
            inventory_item_id: inventoryItemId,
            location_id: stockLoc.id,
            stocked_quantity: 100,
            reserved_quantity: 0,
          });
        }
      }
    } catch (err) {
      console.warn(`Inventory setup skipped for ${variantId}: ${(err as Error).message}`);
    }
  }

  console.log(`CounterFlow catalog ready: ${PRODUCTS.length} products, ${variantIds.length} variants.`);
}
