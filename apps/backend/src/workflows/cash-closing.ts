import { MODULE_KEYS } from "../modules";

interface CashClosingInput {
  device_id: string;
  cashier_id: string;
  opened_at: string;
  closed_at: string;
  cash_in_drawer: number;
  cash_collected: number;
  upi_collected: number;
  card_collected: number;
  credit_outstanding: number;
  notes?: string;
  idempotency_key: string;
}

export async function recordCashClosing(
  container: any,
  input: CashClosingInput,
): Promise<{ ok: true }> {
  const audit = container.resolve(MODULE_KEYS.AUDIT_LOG);
  await audit.log({
    user_id: input.cashier_id,
    device_id: input.device_id,
    action: "cash.closed",
    new_value: input as unknown as Record<string, unknown>,
  });
  return { ok: true };
}
