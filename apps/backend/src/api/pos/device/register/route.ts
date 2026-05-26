import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { registerPosDevice } from "../../../../workflows";
import { ok, badRequest, serverError } from "../../../_utils/response";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const {
    device_code,
    device_name,
    store_location_id,
    sales_channel_id,
    assigned_user_id,
    registered_by,
  } = (req.body ?? {}) as Record<string, string | undefined>;

  if (!device_code || !device_name || !registered_by) {
    return badRequest(
      res,
      "device_code, device_name and registered_by are required",
    );
  }

  try {
    const result = await registerPosDevice((req as any).scope, {
      device_code,
      device_name,
      store_location_id,
      sales_channel_id,
      assigned_user_id,
      registered_by,
    });
    return ok(res, result, 201);
  } catch (err) {
    return serverError(res, err);
  }
}
