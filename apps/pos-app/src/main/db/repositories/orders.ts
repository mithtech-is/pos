import Database from "better-sqlite3";
import { buildLocalOrderNumber, buildIdempotencyKey } from "@pos/shared";
import type { OrderInput, LocalSyncStatus } from "@pos/shared";

interface CreateOrderInput {
  device_id: string;
  device_code: string;
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
  items: Array<{
    variant_id: string;
    sku: string;
    product_name: string;
    size: string;
    quantity: number;
    unit_price: number;
    discount: number;
    tax: number;
    line_total: number;
  }>;
}

export class OrdersRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Allocate the next local order number for `device_code` on today's date.
   *
   * Atomic via an UPSERT + RETURNING-style read inside a transaction so two
   * concurrent IPC calls cannot get the same number.
   */
  allocateLocalOrderNumber(deviceCode: string, now: Date): string {
    const dateKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const seq = this.db.transaction((): number => {
      this.db
        .prepare(
          `INSERT INTO local_daily_sequence (device_code, date_key, last_sequence)
           VALUES (@device_code, @date_key, 0)
           ON CONFLICT(device_code, date_key) DO NOTHING`,
        )
        .run({ device_code: deviceCode, date_key: dateKey });
      this.db
        .prepare(
          `UPDATE local_daily_sequence
              SET last_sequence = last_sequence + 1
            WHERE device_code = @device_code AND date_key = @date_key`,
        )
        .run({ device_code: deviceCode, date_key: dateKey });
      const row = this.db
        .prepare(
          `SELECT last_sequence FROM local_daily_sequence
            WHERE device_code = @device_code AND date_key = @date_key`,
        )
        .get({ device_code: deviceCode, date_key: dateKey }) as {
        last_sequence: number;
      };
      return row.last_sequence;
    })();

    return buildLocalOrderNumber(deviceCode, now, seq);
  }

  /**
   * Insert order + items in a single transaction. Returns the inserted row
   * including the auto-generated id and the OrderInput shape ready for sync.
   */
  createOrder(input: CreateOrderInput & {
    local_order_number: string;
    idempotency_key: string;
    created_at: string;
  }) {
    const insertOrder = this.db.prepare(
      `INSERT INTO local_orders (
         local_order_number, device_id, cashier_id, school_id, class_id,
         student_name, parent_mobile, subtotal, discount_total, tax_total,
         grand_total, payment_mode, payment_reference, sync_status,
         created_offline, created_at, idempotency_key
       ) VALUES (
         @local_order_number, @device_id, @cashier_id, @school_id, @class_id,
         @student_name, @parent_mobile, @subtotal, @discount_total, @tax_total,
         @grand_total, @payment_mode, @payment_reference, 'pending',
         1, @created_at, @idempotency_key
       )`,
    );
    const insertItem = this.db.prepare(
      `INSERT INTO local_order_items (
         local_order_id, variant_id, sku, product_name, size, quantity,
         unit_price, discount, tax, line_total
       ) VALUES (
         @local_order_id, @variant_id, @sku, @product_name, @size, @quantity,
         @unit_price, @discount, @tax, @line_total
       )`,
    );

    const tx = this.db.transaction(() => {
      const result = insertOrder.run(input);
      const localOrderId = Number(result.lastInsertRowid);
      for (const item of input.items) {
        insertItem.run({ ...item, local_order_id: localOrderId });
      }
      return localOrderId;
    });

    const localOrderId = tx();
    return this.getById(localOrderId);
  }

  getById(id: number) {
    const order = this.db
      .prepare("SELECT * FROM local_orders WHERE id = ?")
      .get(id) as any;
    if (!order) return null;
    const items = this.db
      .prepare("SELECT * FROM local_order_items WHERE local_order_id = ?")
      .all(id);
    return { ...order, items };
  }

  list(filter: { sync_status?: LocalSyncStatus; limit?: number; offset?: number } = {}) {
    const where: string[] = [];
    const params: any = {};
    if (filter.sync_status) {
      where.push("sync_status = @sync_status");
      params.sync_status = filter.sync_status;
    }
    const sql = `SELECT * FROM local_orders ${
      where.length ? "WHERE " + where.join(" AND ") : ""
    } ORDER BY created_at DESC LIMIT @limit OFFSET @offset`;
    return this.db
      .prepare(sql)
      .all({ ...params, limit: filter.limit ?? 50, offset: filter.offset ?? 0 });
  }

  markSynced(id: number, serverOrderId: string) {
    return this.db
      .prepare(
        `UPDATE local_orders
            SET sync_status = 'synced',
                server_order_id = ?,
                synced_at = ?
          WHERE id = ?`,
      )
      .run(serverOrderId, new Date().toISOString(), id);
  }

  markStatus(id: number, status: LocalSyncStatus, _lastError?: string) {
    // The detailed error message lives on local_sync_queue.last_error;
    // the orders table only needs a coarse status flag for UI badges.
    return this.db
      .prepare(`UPDATE local_orders SET sync_status = ? WHERE id = ?`)
      .run(status, id);
  }

  /**
   * Convert a local order row + items into the OrderInput shape the sync
   * endpoint expects. Single source of truth for the wire format.
   */
  toOrderInput(row: any): OrderInput {
    return {
      device_id: row.device_id,
      cashier_id: row.cashier_id,
      school_id: row.school_id,
      class_id: row.class_id,
      student_name: row.student_name,
      parent_mobile: row.parent_mobile,
      subtotal: row.subtotal,
      discount_total: row.discount_total,
      tax_total: row.tax_total,
      grand_total: row.grand_total,
      payment_mode: row.payment_mode,
      payment_reference: row.payment_reference,
      created_offline: !!row.created_offline,
      created_at: row.created_at,
      local_order_number: row.local_order_number,
      idempotency_key: row.idempotency_key,
      items: (row.items ?? []).map((it: any) => ({
        variant_id: it.variant_id,
        sku: it.sku,
        product_name: it.product_name,
        size: it.size,
        quantity: it.quantity,
        unit_price: it.unit_price,
        discount: it.discount,
        tax: it.tax,
        line_total: it.line_total,
      })),
    };
  }
}

/** Re-exported for convenience so renderer-side code can build keys consistently. */
export { buildIdempotencyKey };
