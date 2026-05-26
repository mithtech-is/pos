export interface InventorySnapshotRow {
  variant_id: string;
  stock_location_id: string;
  last_synced_quantity: number;
  /**
   * Effective local availability: last_synced_quantity
   *   - unsynced_local_sales
   *   + unsynced_local_returns
   *   + unsynced_local_adjustments
   */
  local_available_quantity: number;
  updated_at: string;
}

export interface StockMovement {
  variant_id: string;
  stock_location_id: string;
  delta: number;
  reason: "sale" | "return" | "adjustment" | "transfer";
  reference_id?: string;
  created_at: string;
}

export interface LowStockRow {
  school?: string;
  product: string;
  size: string;
  location: string;
  current_stock: number;
  minimum_required_stock: number;
  shortage_quantity: number;
  suggested_reorder_quantity: number;
}
