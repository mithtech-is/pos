import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { MODULE_KEYS } from "../../../../modules";
import { ok, serverError } from "../../../_utils/response";

/**
 * Cash closings are stored as audit_log entries with action = "cash.closed"
 * (see cashClosingWorkflow). We aggregate them here rather than maintaining a
 * separate table, since the closing event is itself an audit-grade record.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const audit = (req as any).scope.resolve(MODULE_KEYS.AUDIT_LOG);
    const items = await audit.listAuditLogs(
      { action: "cash.closed" },
      { order: { created_at: "DESC" }, take: 500 },
    );
    return ok(res, {
      items: items.map((a: any) => ({
        ...(a.new_value ?? {}),
        recorded_at: a.created_at,
      })),
      count: items.length,
    });
  } catch (err) {
    return serverError(res, err);
  }
}
