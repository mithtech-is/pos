import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { MODULE_KEYS } from "../../../../modules";
import { ok, badRequest, serverError } from "../../../_utils/response";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { device_code, app_version, pending_orders, failed_orders } =
    (req.body ?? {}) as Record<string, any>;
  if (!device_code) return badRequest(res, "device_code is required");
  try {
    const devices = req.scope.resolve<any>(MODULE_KEYS.POS_DEVICE);
    const updated = await devices.heartbeat(device_code);
    return ok(res, {
      device_status: updated?.[0]?.status ?? "unknown",
      received_at: new Date().toISOString(),
      app_version,
      pending_orders,
      failed_orders,
    });
  } catch (err) {
    return serverError(res, err);
  }
}
