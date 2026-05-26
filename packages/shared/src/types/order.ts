export type PaymentMode = "cash" | "upi" | "card" | "credit" | "school_bulk";

export type LocalSyncStatus =
  | "pending"
  | "syncing"
  | "synced"
  | "failed"
  | "conflict"
  | "cancelled_locally";

export interface OrderItemInput {
  variant_id: string;
  sku: string;
  product_name: string;
  size: string;
  quantity: number;
  unit_price: number;
  discount: number;
  tax: number;
  line_total: number;
}

export interface OrderInput {
  device_id: string;
  cashier_id: string;
  school_id: string;
  class_id?: string | null;
  student_name?: string | null;
  parent_mobile?: string | null;
  items: OrderItemInput[];
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  payment_mode: PaymentMode;
  payment_reference?: string | null;
  created_offline: boolean;
  created_at: string;
  local_order_number: string;
  idempotency_key: string;
}

export interface LocalOrder extends OrderInput {
  id: number;
  server_order_id?: string | null;
  sync_status: LocalSyncStatus;
  synced_at?: string | null;
}
