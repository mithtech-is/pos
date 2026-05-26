import { MODULE_KEYS } from "../modules";
import type { OrderInput } from "@pos/shared";
import { syncOfflineOrderEvent } from "./sync-offline-order";

/**
 * Online POS order create — same payload shape as the offline path; we just
 * pre-record the sync_event and then pipe through the same sync function so
 * online and offline-then-synced orders are indistinguishable in the DB.
 */
export async function createPosOrderEvent(
  container: any,
  args: {
    device_code: string;
    device_token?: string;
    order: OrderInput;
  },
): Promise<{ server_order_id?: string; sync_event_id: string; status: string }> {
  const sync = container.resolve(MODULE_KEYS.OFFLINE_SYNC);

  const batch = await sync.startBatch({
    batch_id: `live_${args.order.local_order_number}`,
    device_id: args.order.device_id,
    total_events: 1,
  });
  const event = await sync.recordEvent({
    batch_id: batch.id,
    device_id: args.order.device_id,
    event_type: "order.created",
    idempotency_key: args.order.idempotency_key,
    payload: args.order as unknown as Record<string, unknown>,
  });

  const result = await syncOfflineOrderEvent(container, {
    sync_event_id: event.id,
    device_code: args.device_code,
    device_token: args.device_token,
    idempotency_key: args.order.idempotency_key,
    order: args.order,
  });

  await sync.finalizeBatch(batch.id, {
    success_count: result.status === "synced" || result.status === "duplicate" ? 1 : 0,
    failed_count: 0,
    conflict_count: result.status === "conflict" ? 1 : 0,
  });

  return {
    server_order_id: result.server_order_id,
    sync_event_id: event.id,
    status: result.status,
  };
}
