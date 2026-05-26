import type { PaymentMode } from "./order";

export interface ReceiptItem {
  product_name: string;
  size: string;
  quantity: number;
  unit_price: number;
  discount: number;
  tax: number;
  line_total: number;
}

export interface ReceiptData {
  distributor_name: string;
  distributor_address?: string;
  gstin?: string;
  receipt_number: string;
  local_order_number: string;
  server_order_number?: string | null;
  date_time: string;
  cashier_name: string;
  school_name: string;
  student_name?: string | null;
  parent_mobile?: string | null;
  items: ReceiptItem[];
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  payment_mode: PaymentMode;
  payment_reference?: string | null;
  sync_status: "offline_pending" | "synced";
  return_policy?: string;
}
