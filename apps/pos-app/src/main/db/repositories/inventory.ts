import Database from "better-sqlite3";
import { computeLocalAvailable } from "@pos/shared";

export class InventoryRepository {
  constructor(private readonly db: Database.Database) {}

  /**
   * Available stock = last_synced - unsynced_sales + unsynced_returns + unsynced_adjustments.
   * If no snapshot exists for the variant we treat available as Infinity to
   * avoid blocking sales — the actual gating happens via the snapshot once it's hydrated.
   */
  getLocalAvailable(variantId: string): number {
    const row = this.db
      .prepare(
        `SELECT last_synced_quantity, unsynced_sales, unsynced_returns, unsynced_adjustments
           FROM local_inventory_snapshot
          WHERE variant_id = ?`,
      )
      .get(variantId) as
      | {
          last_synced_quantity: number;
          unsynced_sales: number;
          unsynced_returns: number;
          unsynced_adjustments: number;
        }
      | undefined;
    if (!row) return Number.POSITIVE_INFINITY;
    return computeLocalAvailable(
      row.last_synced_quantity,
      row.unsynced_sales,
      row.unsynced_returns,
      row.unsynced_adjustments,
    );
  }

  applySale(variantId: string, quantity: number) {
    // Multi-location handling is out of MVP scope: we assume a single
    // local stock location per POS device. The pull sync fills in the row.
    return this.db
      .prepare(
        `UPDATE local_inventory_snapshot
            SET unsynced_sales = unsynced_sales + ?,
                updated_at = ?
          WHERE variant_id = ?`,
      )
      .run(quantity, new Date().toISOString(), variantId);
  }

  applyReturn(variantId: string, quantity: number) {
    return this.db
      .prepare(
        `UPDATE local_inventory_snapshot
            SET unsynced_returns = unsynced_returns + ?,
                updated_at = ?
          WHERE variant_id = ?`,
      )
      .run(quantity, new Date().toISOString(), variantId);
  }

  upsertSnapshot(payload: {
    variant_id: string;
    stock_location_id?: string;
    last_synced_quantity: number;
  }) {
    return this.db
      .prepare(
        `INSERT INTO local_inventory_snapshot
           (variant_id, stock_location_id, last_synced_quantity, unsynced_sales,
            unsynced_returns, unsynced_adjustments, updated_at)
           VALUES (?, ?, ?, 0, 0, 0, ?)
         ON CONFLICT(variant_id, stock_location_id) DO UPDATE SET
           last_synced_quantity = excluded.last_synced_quantity,
           updated_at = excluded.updated_at`,
      )
      .run(
        payload.variant_id,
        payload.stock_location_id ?? "default",
        payload.last_synced_quantity,
        new Date().toISOString(),
      );
  }

  /**
   * Reset the unsynced counters for a variant once the backend confirms the
   * delta has been applied centrally. Called by the sync worker.
   */
  acknowledgeSale(variantId: string, quantity: number) {
    return this.db
      .prepare(
        `UPDATE local_inventory_snapshot
            SET unsynced_sales = MAX(0, unsynced_sales - ?),
                last_synced_quantity = last_synced_quantity - ?,
                updated_at = ?
          WHERE variant_id = ?`,
      )
      .run(quantity, quantity, new Date().toISOString(), variantId);
  }
}
