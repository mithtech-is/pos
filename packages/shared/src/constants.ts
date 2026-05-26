/** All event types emitted by the POS into its sync queue. */
export const SYNC_EVENT_TYPES = [
  "order.created",
  "order.cancelled",
  "return.created",
  "exchange.created",
  "stock.adjusted",
  "cash.closed",
  "audit.event",
] as const;

/** All conflict types raised by the backend during sync push. */
export const CONFLICT_TYPES = [
  "duplicate_order",
  "stock_conflict",
  "product_inactive",
  "price_changed",
  "tax_mismatch",
  "invalid_cashier",
  "invalid_device",
  "invalid_school_mapping",
] as const;

/** Sensitive actions that require manager PIN approval offline. */
export const MANAGER_PIN_ACTIONS = [
  "high_discount",
  "return",
  "exchange",
  "stock_adjustment",
  "cancel_bill",
  "reprint_receipt",
  "open_cash_drawer",
  "manual_price_override",
  "delete_synced_order",
] as const;

/** Default sync worker tick interval in milliseconds. */
export const DEFAULT_SYNC_TICK_MS = 30_000;

/** Maximum events per push batch. */
export const SYNC_PUSH_BATCH_SIZE = 50;

/** Maximum retry attempts before flagging an event as failed for review. */
export const SYNC_MAX_RETRIES = 5;

/** Default offline session expiry — business policy can override. */
export const DEFAULT_OFFLINE_SESSION_DAYS = 7;
