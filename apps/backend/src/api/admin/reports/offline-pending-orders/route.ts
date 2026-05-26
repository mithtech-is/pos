import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { ReportsService } from "../../../../services/reports";
import { ok, serverError } from "../../../_utils/response";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const reports = new ReportsService((req as any).scope);
    const result = await reports.offlinePendingOrders();
    return ok(res, result);
  } catch (err) {
    return serverError(res, err);
  }
}
