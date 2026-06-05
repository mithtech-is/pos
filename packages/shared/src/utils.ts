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

/**
 * Clamp any value to [min, max]. Blank / non-numeric / non-finite input
 * (including NaN and Infinity) collapses to `min`. This is the single
 * primitive behind all numeric input validation — it guarantees no negative
 * and no runaway/"infinite" values reach state, the DB, or the sync queue.
 */
export function clampNumber(value: unknown, min: number, max: number): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/** clampNumber, floored to a whole number — for quantities, stock, points. */
export function clampInt(value: unknown, min: number, max: number): number {
  return Math.floor(clampNumber(value, min, max));
}

/**
 * Sanitize free-typed text for a numeric field and return a STRING that can be
 * fed straight back into a controlled input. Strips everything but digits (and
 * a single leading-group dot when `decimals` is allowed) — so a minus sign can
 * never be entered — then clamps to [min, max]. Preserves a trailing "." while
 * the user is mid-type (e.g. "12.") and keeps an empty field empty.
 */
export function sanitizeNumericInput(
  text: string,
  opts: { min?: number; max: number; decimals?: boolean },
): string {
  const { min = 0, max, decimals = false } = opts;
  if (text == null) return "";
  let cleaned = decimals ? text.replace(/[^0-9.]/g, "") : text.replace(/[^0-9]/g, "");
  if (decimals) {
    const dot = cleaned.indexOf(".");
    if (dot !== -1) {
      cleaned = cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "");
    }
  }
  if (cleaned === "" || cleaned === ".") return "";
  const trailingDot = decimals && cleaned.endsWith(".");
  const clamped = clampNumber(cleaned, min, max);
  return trailingDot ? `${clamped}.` : String(clamped);
}

/** Keep only digits, capped to `maxLen` — for phone / PIN / reference fields. */
export function digitsOnly(text: string, maxLen: number): string {
  return String(text ?? "").replace(/[^0-9]/g, "").slice(0, maxLen);
}

/* ===========================================================================
   Branch (outlet/store) access control
   ---------------------------------------------------------------------------
   A user can be scoped to a subset of branches. The rule, shared by the
   backend, the desktop app, and the mobile app so they never disagree:
     • managers / admins  → every branch (head-office staff are never locked out)
     • cashier WITH assigned branch_ids → only those branches
     • cashier WITHOUT assignments       → every branch (unrestricted default:
       assigning at least one branch is what turns restriction ON)
   =========================================================================== */

/** Roles that always see every branch regardless of assignment. */
export const ALL_BRANCH_ROLES = ["manager", "admin", "owner"] as const;

export interface BranchScopedUser {
  role?: string | null;
  branch_ids?: string[] | null;
}

/** True only when this user is restricted to a specific set of branches. */
export function userHasBranchRestriction(user: BranchScopedUser | null | undefined): boolean {
  if (!user) return false;
  if (user.role && ALL_BRANCH_ROLES.includes(user.role as (typeof ALL_BRANCH_ROLES)[number])) {
    return false;
  }
  return Array.isArray(user.branch_ids) && user.branch_ids.length > 0;
}

/** Whether `user` is allowed to transact on the branch with id `branchId`. */
export function canUseBranch(
  user: BranchScopedUser | null | undefined,
  branchId: string | null | undefined,
): boolean {
  if (!userHasBranchRestriction(user)) return true;
  if (!branchId) return false;
  return (user!.branch_ids as string[]).includes(branchId);
}

/** Filter a list of branches down to the ones `user` may see/select. */
export function filterBranchesForUser<T extends { id: string }>(
  branches: T[],
  user: BranchScopedUser | null | undefined,
): T[] {
  if (!userHasBranchRestriction(user)) return branches;
  const allowed = new Set(user!.branch_ids as string[]);
  return branches.filter((b) => allowed.has(b.id));
}
