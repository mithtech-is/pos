import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { MODULE_KEYS } from "../../../../modules";
import { syncOfflineOrderEvent, createReturn, recordCashClosing } from "../../../../workflows";
import { ok, badRequest, serverError } from "../../../_utils/response";

/**
 * POST /pos/sync/push
 *
 * Receives a batch of offline events from one POS device, routes each event
 * through `syncOfflineOrderEvent` for order.created, and returns per-event results.
 *
 * Idempotency contract: the POS supplies `idempotency_key`
 * (device_id + ":" + local_order_id). The unique index on
 * `sync_event.idempotency_key` guarantees we never duplicate orders on retry.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { device_id, batch_id, events } = (req.body ?? {}) as {
    device_id?: string;
    batch_id?: string;
    events?: Array<{
      event_type: string;
      idempotency_key: string;
      payload: Record<string, unknown>;
    }>;
  };

  if (!device_id || !batch_id || !Array.isArray(events) || events.length === 0) {
    return badRequest(res, "device_id, batch_id and events[] are required");
  }

  const sync = req.scope.resolve<any>(MODULE_KEYS.OFFLINE_SYNC);
  const devices = req.scope.resolve<any>(MODULE_KEYS.POS_DEVICE);
  const deviceCode = (req as any).pos_device_code ?? device_id;
  const deviceToken = (req as any).pos_device_token;

  try {
    await devices.authorizeDevice(deviceCode, deviceToken);
  } catch (err) {
    return serverError(res, err);
  }

  try {
    const batch = await sync.startBatch({
      batch_id,
      device_id,
      total_events: events.length,
    });

    const results: Array<{
      idempotency_key: string;
      status: "synced" | "failed" | "conflict" | "duplicate";
      server_order_id?: string;
      conflict_id?: string;
      error_code?: string;
      error_message?: string;
    }> = [];

    let successCount = 0;
    let failedCount = 0;
    let conflictCount = 0;

    for (const evt of events) {
      const existing = await sync.findByIdempotencyKey(evt.idempotency_key);
      if (
        existing &&
        existing.status === "synced" &&
        existing.server_reference_id
      ) {
        results.push({
          idempotency_key: evt.idempotency_key,
          status: "duplicate",
          server_order_id: existing.server_reference_id,
        });
        successCount++;
        continue;
      }

      const event = existing
        ? existing
        : await sync.recordEvent({
            batch_id: batch.id,
            device_id,
            event_type: evt.event_type,
            idempotency_key: evt.idempotency_key,
            payload: evt.payload,
          });

      try {
        if (evt.event_type === "order.created") {
          const result = await syncOfflineOrderEvent((req as any).scope, {
            sync_event_id: event.id,
            device_code: deviceCode,
            device_token: deviceToken,
            idempotency_key: evt.idempotency_key,
            order: evt.payload as any,
          });
          results.push({
            idempotency_key: evt.idempotency_key,
            status: result.status,
            server_order_id: result.server_order_id,
            conflict_id: result.conflict_id,
            error_code: result.conflict_type,
            error_message: result.error,
          });
          if (result.status === "synced" || result.status === "duplicate") {
            successCount++;
          } else {
            conflictCount++;
          }
        } else if (evt.event_type === "return.created") {
          const { return_id } = await createReturn((req as any).scope, {
            ...(evt.payload as any),
            idempotency_key: evt.idempotency_key,
          });
          await sync.markEventSynced(event.id, return_id);
          results.push({
            idempotency_key: evt.idempotency_key,
            status: "synced",
            server_order_id: return_id,
          });
          successCount++;
        } else if (evt.event_type === "cash.closed") {
          await recordCashClosing((req as any).scope, {
            ...(evt.payload as any),
            idempotency_key: evt.idempotency_key,
          });
          const ref = `cashclose_${evt.idempotency_key}`;
          await sync.markEventSynced(event.id, ref);
          results.push({
            idempotency_key: evt.idempotency_key,
            status: "synced",
            server_order_id: ref,
          });
          successCount++;
        } else {
          await sync.markEventFailed(
            event.id,
            "not_implemented",
            `Sync handler for ${evt.event_type} not yet implemented`,
          );
          results.push({
            idempotency_key: evt.idempotency_key,
            status: "failed",
            error_code: "not_implemented",
            error_message: `Sync handler for ${evt.event_type} not yet implemented`,
          });
          failedCount++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown_error";
        await sync.markEventFailed(event.id, "workflow_error", message);
        results.push({
          idempotency_key: evt.idempotency_key,
          status: "failed",
          error_code: "workflow_error",
          error_message: message,
        });
        failedCount++;
      }
    }

    await sync.finalizeBatch(batch.id, {
      success_count: successCount,
      failed_count: failedCount,
      conflict_count: conflictCount,
    });

    return ok(res, { batch_id, results });
  } catch (err) {
    return serverError(res, err);
  }
}
