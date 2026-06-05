import { buildLocalOrderNumber } from "@pos/shared";
import { openDb, execSql, selectAll, selectOne } from "./index";

/* ===========================================================================
   Master data (read-mostly — hydrated from the sync worker's pull response)
   =========================================================================== */
export const masterData = {
  async listSchools(): Promise<any[]> {
    return selectAll(
      `SELECT id, name, code, area, city, status FROM local_schools
        WHERE status = 'active' ORDER BY name`,
    );
  },

  async listClasses(schoolId: string): Promise<any[]> {
    return selectAll(
      `SELECT id, class_name, display_order, academic_year_id, status
         FROM local_school_classes
        WHERE school_id = ? AND status = 'active'
        ORDER BY display_order, class_name`,
      [schoolId],
    );
  },

  async findByBarcode(barcode: string): Promise<any | null> {
    const byBarcode = await selectOne<any>(
      `SELECT v.*, p.name AS product_name, p.school_id AS product_school_id
         FROM local_variants v
         JOIN local_products p ON p.id = v.product_id
        WHERE v.barcode = ? AND v.status = 'active'`,
      [barcode],
    );
    if (byBarcode) return byBarcode;
    return selectOne<any>(
      `SELECT v.*, p.name AS product_name, p.school_id AS product_school_id
         FROM local_variants v
         JOIN local_products p ON p.id = v.product_id
        WHERE v.sku = ? AND v.status = 'active'`,
      [barcode],
    );
  },

  async searchVariants(query: string): Promise<any[]> {
    const like = `%${query}%`;
    return selectAll(
      `SELECT v.id, v.sku, v.barcode, v.size, v.gender, v.price,
              p.name AS product_name, p.category, p.school_id
         FROM local_variants v
         JOIN local_products p ON p.id = v.product_id
        WHERE (p.name LIKE ? OR v.sku LIKE ? OR v.barcode LIKE ?)
          AND v.status = 'active'
        LIMIT 50`,
      [like, like, like],
    );
  },

  /**
   * Product list used by the Products tab. One row per product with
   * aggregated price range (so the card can show "₹500 — ₹800" when sizes
   * differ) and a variant count.
   */
  async listProducts(args: { query?: string; school_id?: string } = {}): Promise<any[]> {
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
    return selectAll(
      `SELECT p.id, p.name, p.category, p.school_id, p.uniform_type,
              MIN(v.price) AS min_price,
              MAX(v.price) AS max_price,
              COUNT(v.id) AS variant_count,
              s.name AS school_name
         FROM local_products p
         JOIN local_variants v ON v.product_id = p.id
         LEFT JOIN local_schools s ON s.id = p.school_id
        WHERE ${where.join(" AND ")}
        GROUP BY p.id
        ORDER BY p.name
        LIMIT 200`,
      params,
    );
  },

  /** All active variants of a single product — used by the detail modal. */
  async listVariantsForProduct(productId: string): Promise<any[]> {
    return selectAll(
      `SELECT v.id, v.sku, v.barcode, v.size, v.gender, v.color, v.fabric,
              v.price, v.tax_rate,
              p.name AS product_name
         FROM local_variants v
         JOIN local_products p ON p.id = v.product_id
        WHERE v.product_id = ? AND v.status = 'active'
        ORDER BY v.size, v.color`,
      [productId],
    );
  },

  async findKitByContext(args: {
    school_id: string;
    class_id: string;
    gender: string;
    uniform_type: string;
  }): Promise<{ kit: any; items: any[] } | null> {
    const rule = await selectOne<any>(
      `SELECT * FROM local_uniform_rules
        WHERE school_id = ? AND class_id = ? AND gender = ? AND uniform_type = ?
        LIMIT 1`,
      [args.school_id, args.class_id, args.gender, args.uniform_type],
    );
    if (!rule) return null;
    const kit = await selectOne<any>(
      `SELECT * FROM local_kits WHERE id = ?`,
      [rule.kit_id],
    );
    if (!kit) return null;
    const items = await selectAll<any>(
      `SELECT ki.*, v.sku, v.barcode, v.size, v.gender AS variant_gender,
              v.price, p.name AS product_name
         FROM local_kit_items ki
         JOIN local_variants v ON v.id = ki.variant_id
         JOIN local_products p ON p.id = v.product_id
        WHERE ki.kit_id = ?
        ORDER BY ki.sort_order, ki.id`,
      [rule.kit_id],
    );
    return { kit, items };
  },

  /**
   * Apply a pull-sync snapshot. Master tables (schools/classes/products/etc.)
   * are wiped + reinserted so reseeds with new IDs don't leave stale rows.
   * Same strategy as the Electron app.
   */
  async upsertFromPullSync(snapshot: any): Promise<void> {
    const db = await openDb();
    const now = new Date().toISOString();
    await db.withTransactionAsync(async () => {
      if (snapshot.schools !== undefined) {
        await db.runAsync("DELETE FROM local_uniform_rules");
        await db.runAsync("DELETE FROM local_kit_items");
        await db.runAsync("DELETE FROM local_kits");
        await db.runAsync("DELETE FROM local_school_classes");
        await db.runAsync("DELETE FROM local_schools");
      }
      if (snapshot.products !== undefined) {
        await db.runAsync("DELETE FROM local_variants");
        await db.runAsync("DELETE FROM local_products");
      }

      for (const y of snapshot.academic_years ?? []) {
        await db.runAsync(
          `INSERT INTO local_academic_years (id, name, start_date, end_date, is_active, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name, start_date = excluded.start_date,
               end_date = excluded.end_date, is_active = excluded.is_active,
               updated_at = excluded.updated_at`,
          [
            y.id,
            y.name,
            typeof y.start_date === "string" ? y.start_date : new Date(y.start_date).toISOString(),
            typeof y.end_date === "string" ? y.end_date : new Date(y.end_date).toISOString(),
            y.is_active ? 1 : 0,
            now,
          ],
        );
      }

      for (const s of snapshot.schools ?? []) {
        await db.runAsync(
          `INSERT INTO local_schools (id, name, code, area, city, status, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [s.id, s.name, s.code, s.area ?? null, s.city ?? null, s.status ?? "active", now],
        );
      }
      for (const c of snapshot.classes ?? []) {
        await db.runAsync(
          `INSERT INTO local_school_classes
             (id, school_id, class_name, academic_year_id, display_order, status, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            c.id,
            c.school_id,
            c.class_name,
            c.academic_year_id,
            c.display_order ?? 0,
            c.status ?? "active",
            now,
          ],
        );
      }

      for (const p of snapshot.products ?? []) {
        await db.runAsync(
          `INSERT INTO local_products
             (id, name, category, school_id, uniform_type, status, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            p.id,
            p.name ?? p.title,
            p.category ?? p.type ?? null,
            p.school_id ?? p.metadata?.school_id ?? null,
            p.uniform_type ?? p.metadata?.uniform_type ?? null,
            p.status === "draft" ? "inactive" : "active",
            now,
          ],
        );
      }
      for (const v of snapshot.variants ?? []) {
        await db.runAsync(
          `INSERT INTO local_variants
             (id, product_id, sku, barcode, size, gender, price, tax_rate, status, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            v.id,
            v.product_id,
            v.sku,
            v.barcode ?? null,
            v.size ?? null,
            v.gender ?? null,
            v.price ?? 0,
            v.tax_rate ?? 0,
            "active",
            now,
          ],
        );
      }
      for (const k of snapshot.kits ?? []) {
        await db.runAsync(
          `INSERT INTO local_kits
             (id, name, school_id, class_id, gender, uniform_type, academic_year_id, status, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            k.id,
            k.name,
            k.school_id,
            k.class_id,
            k.gender,
            k.uniform_type,
            k.academic_year_id,
            k.status ?? "active",
            now,
          ],
        );
      }
      for (const it of snapshot.kit_items ?? []) {
        await db.runAsync(
          `INSERT INTO local_kit_items
             (id, kit_id, variant_id, quantity, is_required, sort_order)
             VALUES (?, ?, ?, ?, ?, ?)`,
          [
            it.id,
            it.kit_id,
            it.product_variant_id ?? it.variant_id,
            it.quantity ?? 1,
            it.is_required ? 1 : 0,
            it.sort_order ?? 0,
          ],
        );
      }
      for (const r of snapshot.uniform_rules ?? []) {
        await db.runAsync(
          `INSERT INTO local_uniform_rules
             (id, school_id, class_id, gender, uniform_type, kit_id, academic_year_id, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            r.id,
            r.school_id,
            r.class_id,
            r.gender,
            r.uniform_type,
            r.kit_id,
            r.academic_year_id,
            now,
          ],
        );
      }

      // Users + manager_pin_hashes
      if (Array.isArray(snapshot.users)) {
        for (const u of snapshot.users) {
          if (!u.email) continue;
          await db.runAsync(
            "DELETE FROM local_users WHERE email = ? AND id != ?",
            [u.email, u.id],
          );
          await db.runAsync(
            `INSERT INTO local_users
               (id, name, email, role, pin_hash, branch_ids, offline_access_expires_at, status, last_login_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name, role = excluded.role,
               pin_hash = COALESCE(excluded.pin_hash, local_users.pin_hash),
               branch_ids = excluded.branch_ids,
               offline_access_expires_at = excluded.offline_access_expires_at,
               updated_at = excluded.updated_at`,
            [
              u.id,
              u.name,
              u.email,
              u.role,
              u.offline_pin_hash ?? null,
              JSON.stringify(Array.isArray(u.branch_ids) ? u.branch_ids : []),
              new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
              now,
              now,
            ],
          );
        }
      }
      if (Array.isArray(snapshot.manager_pin_hashes)) {
        await settings.set("manager_pin_hashes", snapshot.manager_pin_hashes);
      }
    });
  },
};

/* ===========================================================================
   Settings (key/value store for backend URL, device code, etc.)
   =========================================================================== */
export const settings = {
  async get<T = any>(key: string): Promise<T | null> {
    const row = await selectOne<{ value: string }>(
      "SELECT value FROM local_settings WHERE key = ?",
      [key],
    );
    if (!row) return null;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return row.value as unknown as T;
    }
  },
  async set(key: string, value: unknown): Promise<void> {
    await execSql(
      `INSERT INTO local_settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, JSON.stringify(value), new Date().toISOString()],
    );
  },
};

/* ===========================================================================
   Orders (the offline-first heart of the system)
   =========================================================================== */
export const orders = {
  async allocateLocalOrderNumber(deviceCode: string, now: Date): Promise<string> {
    const dateKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const db = await openDb();
    let seq = 0;
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO local_daily_sequence (device_code, date_key, last_sequence)
           VALUES (?, ?, 0)
           ON CONFLICT(device_code, date_key) DO NOTHING`,
        [deviceCode, dateKey],
      );
      await db.runAsync(
        `UPDATE local_daily_sequence SET last_sequence = last_sequence + 1
          WHERE device_code = ? AND date_key = ?`,
        [deviceCode, dateKey],
      );
      const row = await db.getFirstAsync<{ last_sequence: number }>(
        `SELECT last_sequence FROM local_daily_sequence
          WHERE device_code = ? AND date_key = ?`,
        [deviceCode, dateKey],
      );
      seq = row?.last_sequence ?? 1;
    });
    return buildLocalOrderNumber(deviceCode, now, seq);
  },

  async create(input: {
    local_order_number: string;
    idempotency_key: string;
    device_id: string;
    cashier_id: string;
    school_id: string;
    class_id?: string | null;
    student_name?: string | null;
    parent_mobile?: string | null;
    subtotal: number;
    discount_total: number;
    tax_total: number;
    grand_total: number;
    payment_mode: string;
    payment_reference?: string | null;
    items: any[];
    created_at: string;
  }): Promise<number> {
    const db = await openDb();
    let insertedId = 0;
    await db.withTransactionAsync(async () => {
      const result = await db.runAsync(
        `INSERT INTO local_orders (
           local_order_number, device_id, cashier_id, school_id, class_id,
           student_name, parent_mobile, subtotal, discount_total, tax_total,
           grand_total, payment_mode, payment_reference, sync_status,
           created_offline, created_at, idempotency_key
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 1, ?, ?)`,
        [
          input.local_order_number,
          input.device_id,
          input.cashier_id,
          input.school_id,
          input.class_id ?? null,
          input.student_name ?? null,
          input.parent_mobile ?? null,
          input.subtotal,
          input.discount_total,
          input.tax_total,
          input.grand_total,
          input.payment_mode,
          input.payment_reference ?? null,
          input.created_at,
          input.idempotency_key,
        ],
      );
      insertedId = Number(result.lastInsertRowId);
      for (const item of input.items) {
        await db.runAsync(
          `INSERT INTO local_order_items
             (local_order_id, variant_id, sku, product_name, size, quantity,
              unit_price, discount, tax, line_total)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            insertedId,
            item.variant_id,
            item.sku,
            item.product_name,
            item.size,
            item.quantity,
            item.unit_price,
            item.discount,
            item.tax,
            item.line_total,
          ],
        );
      }
    });
    return insertedId;
  },

  async getById(id: number): Promise<any | null> {
    const order = await selectOne<any>(
      "SELECT * FROM local_orders WHERE id = ?",
      [id],
    );
    if (!order) return null;
    const items = await selectAll(
      "SELECT * FROM local_order_items WHERE local_order_id = ?",
      [id],
    );
    return { ...order, items };
  },

  async list(filter: { sync_status?: string; limit?: number } = {}): Promise<any[]> {
    const where: string[] = [];
    const params: any[] = [];
    if (filter.sync_status) {
      where.push("sync_status = ?");
      params.push(filter.sync_status);
    }
    const sql = `SELECT * FROM local_orders ${
      where.length ? "WHERE " + where.join(" AND ") : ""
    } ORDER BY created_at DESC LIMIT ?`;
    params.push(filter.limit ?? 200);
    return selectAll(sql, params);
  },

  async markSynced(id: number, serverOrderId: string): Promise<void> {
    await execSql(
      `UPDATE local_orders
          SET sync_status = 'synced', server_order_id = ?, synced_at = ?
        WHERE id = ?`,
      [serverOrderId, new Date().toISOString(), id],
    );
  },
};

/* ===========================================================================
   Sync queue
   =========================================================================== */
export const syncQueue = {
  async enqueue(args: {
    event_type: string;
    idempotency_key: string;
    payload: any;
  }): Promise<void> {
    const now = new Date().toISOString();
    await execSql(
      `INSERT OR IGNORE INTO local_sync_queue
         (event_type, idempotency_key, payload, status, retry_count, created_at, updated_at)
         VALUES (?, ?, ?, 'pending', 0, ?, ?)`,
      [args.event_type, args.idempotency_key, JSON.stringify(args.payload), now, now],
    );
  },

  async listPending(limit = 50): Promise<any[]> {
    const rows = await selectAll<any>(
      `SELECT * FROM local_sync_queue
        WHERE status IN ('pending', 'failed') ORDER BY id ASC LIMIT ?`,
      [limit],
    );
    return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
  },

  async markSyncing(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const ph = ids.map(() => "?").join(",");
    await execSql(
      `UPDATE local_sync_queue SET status = 'syncing', updated_at = ?
         WHERE id IN (${ph})`,
      [new Date().toISOString(), ...ids],
    );
  },

  async markSynced(id: number, serverReferenceId?: string): Promise<void> {
    await execSql(
      `UPDATE local_sync_queue
          SET status = 'synced', server_reference_id = ?, updated_at = ?
        WHERE id = ?`,
      [serverReferenceId ?? null, new Date().toISOString(), id],
    );
  },

  async markFailed(id: number, error: string): Promise<void> {
    await execSql(
      `UPDATE local_sync_queue
          SET status = 'failed', retry_count = retry_count + 1,
              last_error = ?, updated_at = ?
        WHERE id = ?`,
      [error, new Date().toISOString(), id],
    );
  },

  async markConflict(id: number, error: string): Promise<void> {
    await execSql(
      `UPDATE local_sync_queue
          SET status = 'conflict', last_error = ?, updated_at = ?
        WHERE id = ?`,
      [error, new Date().toISOString(), id],
    );
  },

  async stats(): Promise<Record<string, number>> {
    const rows = await selectAll<{ status: string; count: number }>(
      `SELECT status, COUNT(*) AS count FROM local_sync_queue GROUP BY status`,
    );
    const out: Record<string, number> = {
      pending: 0,
      syncing: 0,
      synced: 0,
      failed: 0,
      conflict: 0,
    };
    for (const r of rows) out[r.status] = r.count;
    return out;
  },
};

/* ===========================================================================
   Inventory (local snapshot + unsynced deltas)
   =========================================================================== */
export const inventory = {
  async getLocalAvailable(variantId: string): Promise<number> {
    const row = await selectOne<{
      last_synced_quantity: number;
      unsynced_sales: number;
      unsynced_returns: number;
      unsynced_adjustments: number;
    }>(
      `SELECT last_synced_quantity, unsynced_sales, unsynced_returns, unsynced_adjustments
         FROM local_inventory_snapshot WHERE variant_id = ?`,
      [variantId],
    );
    if (!row) return Number.POSITIVE_INFINITY;
    return (
      row.last_synced_quantity -
      row.unsynced_sales +
      row.unsynced_returns +
      row.unsynced_adjustments
    );
  },
  async applySale(variantId: string, quantity: number): Promise<void> {
    await execSql(
      `UPDATE local_inventory_snapshot
          SET unsynced_sales = unsynced_sales + ?, updated_at = ?
        WHERE variant_id = ?`,
      [quantity, new Date().toISOString(), variantId],
    );
  },
};

/* ===========================================================================
   Users (offline PIN verification)
   =========================================================================== */
function parseBranchIds(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.length) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export const users = {
  async list(): Promise<any[]> {
    const rows = await selectAll<any>(
      `SELECT id, name, email, role, branch_ids, status FROM local_users WHERE status = 'active'`,
    );
    return rows.map((r) => ({ ...r, branch_ids: parseBranchIds(r.branch_ids) }));
  },
  async upsert(payload: {
    id: string;
    name: string;
    email: string;
    role: string;
    offline_access_expires_at?: string | null;
    pin_hash?: string | null;
    branch_ids?: string[] | null;
  }): Promise<void> {
    const now = new Date().toISOString();
    await execSql(`DELETE FROM local_users WHERE email = ? AND id != ?`, [
      payload.email,
      payload.id,
    ]);
    await execSql(
      `INSERT INTO local_users
         (id, name, email, role, pin_hash, branch_ids, offline_access_expires_at, status, last_login_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, role = excluded.role,
           pin_hash = COALESCE(excluded.pin_hash, local_users.pin_hash),
           branch_ids = COALESCE(excluded.branch_ids, local_users.branch_ids),
           last_login_at = excluded.last_login_at,
           updated_at = excluded.updated_at`,
      [
        payload.id,
        payload.name,
        payload.email,
        payload.role,
        payload.pin_hash ?? null,
        payload.branch_ids === undefined || payload.branch_ids === null
          ? null
          : JSON.stringify(payload.branch_ids),
        payload.offline_access_expires_at ?? null,
        now,
        now,
      ],
    );
  },
};

/* ===========================================================================
   Audit
   =========================================================================== */
export const audit = {
  async log(payload: {
    user_id?: string;
    device_id?: string;
    action: string;
    data?: any;
  }): Promise<void> {
    await execSql(
      `INSERT INTO local_audit_logs
         (user_id, device_id, action, payload, sync_status, created_at)
         VALUES (?, ?, ?, ?, 'pending', ?)`,
      [
        payload.user_id ?? null,
        payload.device_id ?? null,
        payload.action,
        payload.data ? JSON.stringify(payload.data) : null,
        new Date().toISOString(),
      ],
    );
  },
};
