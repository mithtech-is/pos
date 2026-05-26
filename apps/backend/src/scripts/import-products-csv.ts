import { Modules } from "@medusajs/framework/utils";
import fs from "node:fs";
import path from "node:path";
import { MODULE_KEYS } from "../modules";

/**
 * CSV-driven product import.
 *
 * Reads products + variants from `apps/backend/src/scripts/products.csv` (or
 * the file path you pass as an arg). Idempotent — re-running with the same
 * SKUs updates prices in metadata but doesn't duplicate products.
 *
 * Expected columns (header row required):
 *   school_code, product_title, category, gender, uniform_type, size, sku, barcode, price
 *
 * Example:
 *   GVPS,GVPS Boys Shirt,Shirt,boy,regular,28,GVPS-BSH-28,GVPS-BSH-28,350
 *   GVPS,GVPS Belt,Belt,unisex,regular,F,GVPS-BLT-F,GVPS-BLT-F,90
 *
 * Run with:
 *   npx medusa exec ./src/scripts/import-products-csv.ts ./path/to/products.csv
 */
interface Row {
  school_code: string;
  product_title: string;
  category: string;
  gender: "boy" | "girl" | "unisex";
  uniform_type: string;
  size: string;
  sku: string;
  barcode: string;
  price: number;
}

function parseCsv(text: string): Row[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    const obj: any = {};
    headers.forEach((h, i) => (obj[h] = cols[i] ?? ""));
    return {
      school_code: obj.school_code,
      product_title: obj.product_title,
      category: obj.category,
      gender: (obj.gender || "unisex") as Row["gender"],
      uniform_type: obj.uniform_type || "regular",
      size: obj.size,
      sku: obj.sku,
      barcode: obj.barcode || obj.sku,
      price: Number(obj.price),
    };
  });
}

export default async function importProductsCsv({
  container,
  args,
}: {
  container: any;
  args: string[];
}) {
  const filePath = path.resolve(
    args[0] ?? path.join(__dirname, "products.csv"),
  );
  if (!fs.existsSync(filePath)) {
    console.error(`CSV not found at ${filePath}`);
    return;
  }
  const rows = parseCsv(fs.readFileSync(filePath, "utf8"));
  console.log(`Parsed ${rows.length} rows from ${filePath}`);

  const productSvc = container.resolve(Modules.PRODUCT);
  const schoolSvc = container.resolve(MODULE_KEYS.SCHOOL);

  // Group rows by product title.
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.product_title || !r.sku) continue;
    const arr = groups.get(r.product_title) ?? [];
    arr.push(r);
    groups.set(r.product_title, arr);
  }

  // Cache school lookup by code.
  const schoolsByCode: Record<string, any> = {};
  for (const s of await schoolSvc.listSchools({})) {
    schoolsByCode[s.code] = s;
  }

  let createdProducts = 0;
  let createdVariants = 0;
  let updatedVariants = 0;

  for (const [title, groupRows] of groups) {
    const first = groupRows[0];
    const school = schoolsByCode[first.school_code];
    if (!school) {
      console.warn(`Skipping ${title}: school code "${first.school_code}" not found`);
      continue;
    }

    // Does a product with this title already exist?
    const [existingProduct] = await productSvc.listProducts({ title });

    if (existingProduct) {
      // For each row, upsert the variant.
      for (const row of groupRows) {
        const [existingVariant] = await productSvc.listProductVariants({
          sku: row.sku,
        });
        if (existingVariant) {
          await productSvc.updateProductVariants(existingVariant.id, {
            metadata: {
              ...(existingVariant.metadata ?? {}),
              price: row.price,
              size: row.size,
              gender: row.gender,
              tax_rate: 0.05,
              school_id: school.id,
              school_code: school.code,
              category: row.category,
              uniform_type: row.uniform_type,
            },
            barcode: row.barcode,
          });
          updatedVariants++;
        } else {
          await productSvc.createProductVariants({
            product_id: existingProduct.id,
            title: `${title} ${row.size}`,
            sku: row.sku,
            barcode: row.barcode,
            manage_inventory: true,
            metadata: {
              price: row.price,
              size: row.size,
              gender: row.gender,
              tax_rate: 0.05,
              school_id: school.id,
              school_code: school.code,
              category: row.category,
              uniform_type: row.uniform_type,
            },
          });
          createdVariants++;
        }
      }
    } else {
      const sizes = [...new Set(groupRows.map((r) => r.size))];
      await productSvc.createProducts({
        title,
        status: "published",
        handle: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        options: [{ title: "Size", values: sizes }],
        variants: groupRows.map((row) => ({
          title: `${title} ${row.size}`,
          sku: row.sku,
          barcode: row.barcode,
          manage_inventory: true,
          options: { Size: row.size },
          metadata: {
            price: row.price,
            size: row.size,
            gender: row.gender,
            tax_rate: 0.05,
            school_id: school.id,
            school_code: school.code,
            category: row.category,
            uniform_type: row.uniform_type,
          },
        })),
        metadata: {
          school_id: school.id,
          category: first.category,
          gender: first.gender,
          uniform_type: first.uniform_type,
        },
      });
      createdProducts++;
      createdVariants += groupRows.length;
    }
  }

  console.log(
    `\nDone. Created ${createdProducts} products, ${createdVariants} variants. Updated ${updatedVariants} existing variants.`,
  );
}
