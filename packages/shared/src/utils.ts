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
