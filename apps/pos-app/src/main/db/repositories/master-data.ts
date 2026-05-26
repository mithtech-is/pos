import Database from "better-sqlite3";

/**
 * Read-mostly repository over the master-data tables. Writes happen only when
 * the sync worker hydrates these from a /pos/sync/pull response.
 */
export class MasterDataRepository {
  constructor(private readonly db: Database.Database) {}

  listSchools() {
    return this.db
      .prepare(
        `SELECT id, name, code, area, city, status
           FROM local_schools
          WHERE status = 'active'
          ORDER BY name`,
      )
      .all();
  }

  listClasses(schoolId: string) {
    return this.db
      .prepare(
        `SELECT id, class_name, display_order, academic_year_id, status
           FROM local_school_classes
          WHERE school_id = ? AND status = 'active'
          ORDER BY display_order, class_name`,
      )
      .all(schoolId);
  }

  /**
   * Find a variant by exact barcode (preferred), then by exact SKU (fallback).
   * Hot path during scanning — must be near-instant. The index on `barcode`
   * makes this O(log n).
   */
  findByBarcode(barcode: string) {
    const byBarcode = this.db
      .prepare(
        `SELECT v.*, p.name AS product_name, p.school_id AS product_school_id
           FROM local_variants v
           JOIN local_products p ON p.id = v.product_id
          WHERE v.barcode = ? AND v.status = 'active'`,
      )
      .get(barcode);
    if (byBarcode) return byBarcode;
    return this.db
      .prepare(
        `SELECT v.*, p.name AS product_name, p.school_id AS product_school_id
           FROM local_variants v
           JOIN local_products p ON p.id = v.product_id
          WHERE v.sku = ? AND v.status = 'active'`,
      )
      .get(barcode);
  }

  searchVariants(query: string) {
    const like = `%${query}%`;
    return this.db
      .prepare(
        `SELECT v.id, v.sku, v.barcode, v.size, v.gender, v.price,
                p.name AS product_name, p.category, p.school_id
           FROM local_variants v
           JOIN local_products p ON p.id = v.product_id
          WHERE (p.name LIKE ? OR v.sku LIKE ? OR v.barcode LIKE ?)
            AND v.status = 'active'
          LIMIT 50`,
      )
      .all(like, like, like);
  }

  /**
   * Product list used by the Products grid. One row per product with
   * aggregated price range (so the card can show "₹500 — ₹800" when sizes
   * differ) and a variant count.
   */
  listProducts(args: { query?: string; school_id?: string } = {}) {
    const where: string[] = ["v.status = 'active'", "p.status = 'active'"];
    const params: any[] = [];
    if (args.query) {
      where.push("(p.name LIKE ? OR v.sku LIKE ? OR v.barcode LIKE ?)");
      const like = `%${args.query}%`;
      params.push(like, like, like);
    }
    if (args.school_id) {
      where.push("p.school_id = ?");
      params.push(args.school_id);
    }
    return this.db
      .prepare(
        `SELECT p.id, p.name, p.category, p.school_id, p.uniform_type,
                MIN(v.price) AS min_price,
                MAX(v.price) AS max_price,
                COUNT(v.id)  AS variant_count,
                s.name AS school_name,
                s.code AS school_code
           FROM local_products p
           JOIN local_variants v ON v.product_id = p.id
           LEFT JOIN local_schools s ON s.id = p.school_id
          WHERE ${where.join(" AND ")}
          GROUP BY p.id
          ORDER BY p.name
          LIMIT 500`,
      )
      .all(...params);
  }

  /** All active variants of a single product — used by the detail modal. */
  listVariantsForProduct(productId: string) {
    return this.db
      .prepare(
        `SELECT v.id, v.sku, v.barcode, v.size, v.gender, v.color, v.fabric,
                v.price, v.tax_rate,
                p.name AS product_name
           FROM local_variants v
           JOIN local_products p ON p.id = v.product_id
          WHERE v.product_id = ? AND v.status = 'active'
          ORDER BY v.size, v.color`,
      )
      .all(productId);
  }

  /**
   * Find the configured kit for a (school, class, gender, uniform_type) cell.
   * Returns the kit and its items in one shot for the POS suggestion panel.
   */
  findKitByContext(args: {
    school_id: string;
    class_id: string;
    gender: string;
    uniform_type: string;
    academic_year_id?: string;
  }) {
    const rule = this.db
      .prepare(
        `SELECT * FROM local_uniform_rules
          WHERE school_id = @school_id
            AND class_id = @class_id
            AND gender = @gender
            AND uniform_type = @uniform_type
            ${args.academic_year_id ? "AND academic_year_id = @academic_year_id" : ""}
          LIMIT 1`,
      )
      .get(args) as any;
    if (!rule) return null;
    const kit = this.db
      .prepare("SELECT * FROM local_kits WHERE id = ?")
      .get(rule.kit_id);
    if (!kit) return null;
    const items = this.db
      .prepare(
        `SELECT ki.*, v.sku, v.barcode, v.size, v.gender AS variant_gender,
                v.price, p.name AS product_name
           FROM local_kit_items ki
           JOIN local_variants v ON v.id = ki.variant_id
           JOIN local_products p ON p.id = v.product_id
          WHERE ki.kit_id = ?
          ORDER BY ki.sort_order, ki.id`,
      )
      .all(rule.kit_id);
    return { kit, items };
  }

  /**
   * Hydrate every master-data table from a /pos/sync/pull response.
   * Runs in a single transaction so the POS never sees a partial snapshot.
   */
  upsertFromPullSync(snapshot: {
    schools?: any[];
    classes?: any[];
    academic_years?: any[];
    products?: any[];
    variants?: any[];
    kits?: any[];
    kit_items?: any[];
    uniform_rules?: any[];
    inventory_snapshot?: any[];
    users?: any[];
    settings?: Record<string, unknown>;
    blocked_devices?: string[];
  }) {
    const tx = this.db.transaction(() => {
      const now = new Date().toISOString();

      // ----- FULL-SNAPSHOT TABLES ----------------------------------------
      // The backend always sends the complete list for these (no incremental
      // filtering), so we wipe + reinsert. This is the only robust way to
      // handle reseeds where backend IDs change but business codes don't.
      if (snapshot.schools !== undefined) {
        // Order matters: clear dependent rows first to satisfy FKs.
        this.db.prepare("DELETE FROM local_uniform_rules").run();
        this.db.prepare("DELETE FROM local_kit_items").run();
        this.db.prepare("DELETE FROM local_kits").run();
        this.db.prepare("DELETE FROM local_school_classes").run();
        this.db.prepare("DELETE FROM local_schools").run();
      }

      if (snapshot.academic_years?.length) {
        const stmt = this.db.prepare(
          `INSERT INTO local_academic_years
             (id, name, start_date, end_date, is_active, updated_at)
           VALUES (@id, @name, @start_date, @end_date, @is_active, @updated_at)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             start_date = excluded.start_date,
             end_date = excluded.end_date,
             is_active = excluded.is_active,
             updated_at = excluded.updated_at`,
        );
        for (const y of snapshot.academic_years) {
          stmt.run({
            id: y.id,
            name: y.name,
            start_date: typeof y.start_date === "string" ? y.start_date : new Date(y.start_date).toISOString(),
            end_date: typeof y.end_date === "string" ? y.end_date : new Date(y.end_date).toISOString(),
            is_active: y.is_active ? 1 : 0,
            updated_at: now,
          });
        }
      }

      if (snapshot.schools?.length) {
        // First pass: prune any local row whose `code` matches an incoming
        // school but whose `id` differs (happens when the backend gets
        // reseeded — same school code, fresh id). Then upsert by id.
        const incomingCodes = snapshot.schools.map((s: any) => s.code);
        // Also delete rows whose code is no longer in the pull at all
        // (e.g. an old demo school that the backend dropped).
        const codesSql = incomingCodes.map(() => "?").join(",");
        if (codesSql) {
          this.db
            .prepare(
              `DELETE FROM local_schools WHERE code NOT IN (${codesSql})`,
            )
            .run(...incomingCodes);
        }
        const dedupe = this.db.prepare(
          `DELETE FROM local_schools WHERE code = ? AND id != ?`,
        );
        const stmt = this.db.prepare(
          `INSERT INTO local_schools (id, name, code, area, city, status, updated_at)
             VALUES (@id, @name, @code, @area, @city, @status, @updated_at)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               code = excluded.code,
               area = excluded.area,
               city = excluded.city,
               status = excluded.status,
               updated_at = excluded.updated_at`,
        );
        for (const s of snapshot.schools) {
          dedupe.run(s.code, s.id);
          stmt.run({
            id: s.id,
            name: s.name,
            code: s.code,
            area: s.area ?? null,
            city: s.city ?? null,
            status: s.status ?? "active",
            updated_at: now,
          });
        }
      }

      if (snapshot.classes?.length) {
        const stmt = this.db.prepare(
          `INSERT INTO local_school_classes
             (id, school_id, class_name, academic_year_id, display_order, status, updated_at)
           VALUES (@id, @school_id, @class_name, @academic_year_id, @display_order, @status, @updated_at)
           ON CONFLICT(id) DO UPDATE SET
             school_id = excluded.school_id,
             class_name = excluded.class_name,
             academic_year_id = excluded.academic_year_id,
             display_order = excluded.display_order,
             status = excluded.status,
             updated_at = excluded.updated_at`,
        );
        for (const c of snapshot.classes) {
          stmt.run({
            id: c.id,
            school_id: c.school_id,
            class_name: c.class_name,
            academic_year_id: c.academic_year_id,
            display_order: c.display_order ?? 0,
            status: c.status ?? "active",
            updated_at: now,
          });
        }
      }

      // Catalog tables are also full-snapshot now (variant filter was removed
      // upstream because metadata updates don't bump updated_at). Wipe + reinsert.
      if (snapshot.products !== undefined) {
        this.db.prepare("DELETE FROM local_variants").run();
        this.db.prepare("DELETE FROM local_products").run();
      }

      if (snapshot.products?.length) {
        const stmt = this.db.prepare(
          `INSERT INTO local_products
             (id, name, category, school_id, uniform_type, status, updated_at)
           VALUES (@id, @name, @category, @school_id, @uniform_type, @status, @updated_at)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             category = excluded.category,
             school_id = excluded.school_id,
             uniform_type = excluded.uniform_type,
             status = excluded.status,
             updated_at = excluded.updated_at`,
        );
        for (const p of snapshot.products) {
          stmt.run({
            id: p.id,
            name: p.name ?? p.title,
            category: p.category ?? p.type ?? null,
            school_id: p.school_id ?? p.metadata?.school_id ?? null,
            uniform_type: p.uniform_type ?? p.metadata?.uniform_type ?? null,
            status: p.status === "draft" ? "inactive" : "active",
            updated_at: now,
          });
        }
      }

      if (snapshot.variants?.length) {
        const stmt = this.db.prepare(
          `INSERT INTO local_variants
             (id, product_id, sku, barcode, size, gender, color, fabric,
              class_from, class_to, price, tax_rate, status, academic_year_id, updated_at)
           VALUES (@id, @product_id, @sku, @barcode, @size, @gender, @color, @fabric,
                   @class_from, @class_to, @price, @tax_rate, @status, @academic_year_id, @updated_at)
           ON CONFLICT(id) DO UPDATE SET
             product_id = excluded.product_id,
             sku = excluded.sku,
             barcode = excluded.barcode,
             size = excluded.size,
             gender = excluded.gender,
             color = excluded.color,
             fabric = excluded.fabric,
             class_from = excluded.class_from,
             class_to = excluded.class_to,
             price = excluded.price,
             tax_rate = excluded.tax_rate,
             status = excluded.status,
             academic_year_id = excluded.academic_year_id,
             updated_at = excluded.updated_at`,
        );
        for (const v of snapshot.variants) {
          stmt.run({
            id: v.id,
            product_id: v.product_id,
            sku: v.sku,
            barcode: v.barcode ?? null,
            size: v.size ?? v.options?.find?.((o: any) => o.title === "Size")?.value ?? null,
            gender: v.gender ?? v.options?.find?.((o: any) => o.title === "Gender")?.value ?? null,
            color: v.color ?? null,
            fabric: v.fabric ?? null,
            class_from: v.class_from ?? null,
            class_to: v.class_to ?? null,
            price: v.price ?? v.prices?.[0]?.amount ?? 0,
            tax_rate: v.tax_rate ?? 0,
            status: "active",
            academic_year_id: v.academic_year_id ?? null,
            updated_at: now,
          });
        }
      }

      if (snapshot.kits?.length) {
        const stmt = this.db.prepare(
          `INSERT INTO local_kits
             (id, name, school_id, class_id, gender, uniform_type, academic_year_id, status, updated_at)
           VALUES (@id, @name, @school_id, @class_id, @gender, @uniform_type, @academic_year_id, @status, @updated_at)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             school_id = excluded.school_id,
             class_id = excluded.class_id,
             gender = excluded.gender,
             uniform_type = excluded.uniform_type,
             academic_year_id = excluded.academic_year_id,
             status = excluded.status,
             updated_at = excluded.updated_at`,
        );
        for (const k of snapshot.kits) {
          stmt.run({
            ...k,
            status: k.status ?? "active",
            updated_at: now,
          });
        }
      }

      if (snapshot.kit_items?.length) {
        // For simplicity: wipe + reinsert. Kits don't change often.
        this.db.prepare("DELETE FROM local_kit_items").run();
        const stmt = this.db.prepare(
          `INSERT INTO local_kit_items
             (id, kit_id, variant_id, quantity, is_required, sort_order)
           VALUES (@id, @kit_id, @variant_id, @quantity, @is_required, @sort_order)`,
        );
        for (const it of snapshot.kit_items) {
          stmt.run({
            id: it.id,
            kit_id: it.kit_id,
            variant_id: it.product_variant_id ?? it.variant_id,
            quantity: it.quantity ?? 1,
            is_required: it.is_required ? 1 : 0,
            sort_order: it.sort_order ?? 0,
          });
        }
      }

      if (snapshot.uniform_rules?.length) {
        this.db.prepare("DELETE FROM local_uniform_rules").run();
        const stmt = this.db.prepare(
          `INSERT INTO local_uniform_rules
             (id, school_id, class_id, gender, uniform_type, kit_id, academic_year_id, updated_at)
           VALUES (@id, @school_id, @class_id, @gender, @uniform_type, @kit_id, @academic_year_id, @updated_at)`,
        );
        for (const r of snapshot.uniform_rules) {
          stmt.run({ ...r, updated_at: now });
        }
      }

      if (snapshot.settings) {
        const stmt = this.db.prepare(
          `INSERT INTO local_settings (key, value, updated_at)
             VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        );
        for (const [key, value] of Object.entries(snapshot.settings)) {
          stmt.run(key, JSON.stringify(value), now);
        }
      }

      if (snapshot.blocked_devices?.length) {
        this.db
          .prepare(
            `INSERT INTO local_settings (key, value, updated_at)
               VALUES ('blocked_devices', ?, ?)
               ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
          )
          .run(JSON.stringify(snapshot.blocked_devices), now);
      }
    });

    tx();
    return { ok: true };
  }
}
