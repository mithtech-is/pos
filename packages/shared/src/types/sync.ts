export type SyncEventType =
  | "order.created"
  | "order.cancelled"
  | "return.created"
  | "exchange.created"
  | "stock.adjusted"
  | "cash.closed"
  | "audit.event";

export type SyncEventStatus =
  | "pending"
  | "syncing"
  | "synced"
  | "failed"
  | "conflict";

export type ConflictType =
  | "duplicate_order"
  | "stock_conflict"
  | "product_inactive"
  | "price_changed"
  | "tax_mismatch"
  | "invalid_cashier"
  | "invalid_device"
  | "invalid_school_mapping";

export type ConflictSeverity = "low" | "medium" | "high" | "critical";

export type ConflictResolutionStatus =
  | "open"
  | "in_progress"
  | "resolved"
  | "rejected";

export interface SyncEventPayload {
  event_type: SyncEventType;
  idempotency_key: string;
  payload: Record<string, unknown>;
}

export interface SyncPushRequest {
  device_id: string;
  batch_id: string;
  events: SyncEventPayload[];
}

export interface SyncPushResultItem {
  idempotency_key: string;
  status: "synced" | "failed" | "conflict" | "duplicate";
  server_order_id?: string;
  conflict_id?: string;
  error_code?: string;
  error_message?: string;
}

export interface SyncPushResponse {
  batch_id: string;
  results: SyncPushResultItem[];
}

export interface SyncPullRequest {
  device_id: string;
  last_sync_at?: string | null;
}

export interface SyncPullResponse {
  server_time: string;
  schools: unknown[];
  classes: unknown[];
  academic_years: unknown[];
  products: unknown[];
  variants: unknown[];
  kits: unknown[];
  kit_items: unknown[];
  prices: unknown[];
  inventory_snapshot: unknown[];
  users: unknown[];
  settings: unknown[];
  blocked_devices: string[];
}
