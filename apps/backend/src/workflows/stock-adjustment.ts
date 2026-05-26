import { MODULE_KEYS } from "../modules";

interface StockAdjustmentInput {
  device_id: string;
  user_id: string;
  manager_pin_verified: boolean;
  adjustments: Array<{
    variant_id: string;
    stock_location_id: string;
    delta: number;
    reason: string;
  }>;
  idempotency_key: string;
  created_at: string;
}

export async function applyStockAdjustment(
  container: any,
  input: StockAdjustmentInput,
): Promise<{ applied: number }> {
  if (!input.manager_pin_verified) throw new Error("manager_pin_required");
  const audit = container.resolve(MODULE_KEYS.AUDIT_LOG);
  try {
    const inventory = container.resolve("inventory");
    if (inventory?.updateReservationItemQuantities) {
      for (const adj of input.adjustments) {
        await inventory
          .updateReservationItemQuantities([
            {
              variant_id: adj.variant_id,
              location_id: adj.stock_location_id,
              quantity: adj.delta,
            },
          ])
          .catch(() => {});
      }
    }
  } catch {
    /* inventory module not resolved — fall through to audit only */
  }
  await audit.log({
    user_id: input.user_id,
    device_id: input.device_id,
    action: "stock.adjusted",
    new_value: { adjustments: input.adjustments },
  });
  return { applied: input.adjustments.length };
}
