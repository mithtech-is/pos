import { MODULE_KEYS } from "../modules";

interface ReturnInput {
  device_id: string;
  cashier_id: string;
  original_order_id: string;
  manager_pin_verified: boolean;
  items: Array<{
    variant_id: string;
    quantity: number;
    refund_amount: number;
    reason: string;
  }>;
  refund_mode: "cash" | "store_credit";
  idempotency_key: string;
  created_at: string;
}

export async function createReturn(
  container: any,
  input: ReturnInput,
): Promise<{ return_id: string }> {
  if (!input.manager_pin_verified) {
    throw new Error("manager_pin_required");
  }
  const audit = container.resolve(MODULE_KEYS.AUDIT_LOG);
  let returnId: string;
  try {
    const orderService = container.resolve("order");
    if (orderService?.createReturn) {
      const ret = await orderService.createReturn({
        order_id: input.original_order_id,
        items: input.items,
        refund_amount: input.items.reduce((s, i) => s + i.refund_amount, 0),
      });
      returnId = ret.id;
    } else {
      returnId = `ret_${input.idempotency_key}`;
    }
  } catch {
    returnId = `ret_${input.idempotency_key}`;
  }
  await audit.log({
    user_id: input.cashier_id,
    device_id: input.device_id,
    action: "return.created",
    entity_type: "return",
    entity_id: returnId,
    new_value: { items: input.items, refund_mode: input.refund_mode },
  });
  return { return_id: returnId };
}
