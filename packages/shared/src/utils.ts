/**
 * Build the idempotency key for an offline order.
 * Format: device_id + ":" + local_order_id  (per the build plan, section 10.3).
 */
export function buildIdempotencyKey(
  deviceId: string,
  localOrderId: string,
): string {
  return `${deviceId}:${localOrderId}`;
}

/**
 * Build a local order number in the format DEVICE_CODE-YYYYMMDD-SEQUENCE.
 * Sequence is zero-padded to four digits. Example: POS001-20260518-0001.
 */
export function buildLocalOrderNumber(
  deviceCode: string,
  now: Date,
  dailySequence: number,
): string {
  const yyyy = now.getFullYear().toString().padStart(4, "0");
  const mm = (now.getMonth() + 1).toString().padStart(2, "0");
  const dd = now.getDate().toString().padStart(2, "0");
  const seq = dailySequence.toString().padStart(4, "0");
  return `${deviceCode}-${yyyy}${mm}${dd}-${seq}`;
}

/**
 * Compute local available stock from the snapshot and unsynced local deltas.
 *
 * Local Available Stock =
 *   Last Synced Stock
 *   - Unsynced Local Sales
 *   + Unsynced Local Returns
 *   + Unsynced Local Adjustments
 */
export function computeLocalAvailable(
  lastSynced: number,
  unsyncedSales: number,
  unsyncedReturns: number,
  unsyncedAdjustments: number,
): number {
  return (
    lastSynced - unsyncedSales + unsyncedReturns + unsyncedAdjustments
  );
}

export interface GstBreakup {
  taxable_value: number;
  gst_amount: number;
  cgst: number;
  sgst: number;
  grand_total: number;
}

/**
 * Compute the GST breakup for an invoice from the gross amount AFTER discounts.
 *
 * - ratePct is the full GST rate as a percentage (e.g. 18 for 18%).
 * - For an intra-state sale GST splits equally into CGST + SGST.
 * - priceIncludesTax = true  -> the gross already includes GST (MRP); we back
 *   out the tax so taxable_value = gross / (1 + r) and the grand total is the
 *   gross unchanged.
 * - priceIncludesTax = false -> GST is added on top of the gross.
 * - rate <= 0 -> no tax (taxable_value = gross, grand_total = gross).
 */
export function computeGstBreakup(
  grossAfterDiscount: number,
  ratePct: number,
  priceIncludesTax: boolean,
): GstBreakup {
  const gross = Math.max(0, grossAfterDiscount);
  const r = (ratePct || 0) / 100;
  if (r <= 0) {
    return { taxable_value: gross, gst_amount: 0, cgst: 0, sgst: 0, grand_total: gross };
  }
  if (priceIncludesTax) {
    const taxable = gross / (1 + r);
    const gst = gross - taxable;
    return { taxable_value: taxable, gst_amount: gst, cgst: gst / 2, sgst: gst / 2, grand_total: gross };
  }
  const gst = gross * r;
  return { taxable_value: gross, gst_amount: gst, cgst: gst / 2, sgst: gst / 2, grand_total: gross + gst };
}

import type { PosPromotion } from "./types/promotion";

/** Whether a promotion is active for `now` (respecting its validity window). */
export function isPromoActiveAt(promo: PosPromotion, now: Date): boolean {
  if (!promo.active) return false;
  if (promo.starts_at && now < new Date(promo.starts_at)) return false;
  if (promo.ends_at && now > new Date(promo.ends_at)) return false;
  return true;
}

/**
 * The ₹ discount a promotion yields for the current cart. Never exceeds the
 * subtotal and never goes negative. BOGO = the single cheapest unit free
 * (requires at least 2 items in the cart).
 */
export function computePromoDiscount(
  promo: PosPromotion,
  ctx: { subtotal: number; cheapestUnit: number; totalQty: number },
): number {
  const subtotal = Math.max(0, ctx.subtotal);
  if (!promo.active) return 0;
  if (promo.min_subtotal && subtotal < promo.min_subtotal) return 0;
  let d = 0;
  if (promo.type === "percent") d = subtotal * (promo.value / 100);
  else if (promo.type === "flat") d = promo.value;
  else if (promo.type === "bogo") d = ctx.totalQty >= 2 ? ctx.cheapestUnit : 0;
  return Math.max(0, Math.min(d, subtotal));
}
