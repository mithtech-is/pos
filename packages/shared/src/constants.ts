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

/**
 * Bounds for every numeric input field across the POS (INR retail context).
 * The lower bound is always 0 — no field can go negative — and each upper
 * bound keeps a value realistic/achievable so a fat-finger, a stuck key, or a
 * runaway entry can never push absurd ("infinite") numbers into the data.
 * Single source of truth shared by the desktop app, the mobile app, and the
 * backend so UI validation and server-side clamping always agree.
 */
export const INPUT_LIMITS = {
  /** ₹1 crore — cash drawer float / counted totals. */
  MONEY_MAX: 10_000_000,
  /** ₹10 lakh — per-unit price, flat coupon value, PO line cost. */
  PRICE_MAX: 1_000_000,
  /** Line-item / purchase-order quantity. */
  QTY_MAX: 9_999,
  /** Stock on hand / reorder point. */
  STOCK_MAX: 1_000_000,
  /** Discount %, gross-margin %, GST/tax rate %. */
  PERCENT_MAX: 100,
  /** ₹ spent per loyalty point earned. */
  LOYALTY_RATE_MAX: 100_000,
  /** Indian mobile number length. */
  MOBILE_DIGITS: 10,
  /** Manager / login PIN length. */
  PIN_DIGITS: 6,
  /** UPI UTR / bank transaction reference length. */
  UTR_DIGITS: 22,
} as const;
