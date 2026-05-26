import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { MODULE_KEYS } from "../../../modules";
import { ok, serverError } from "../../_utils/response";

/**
 * GET /pos/transactions
 *
 * Same aggregation as /admin/reports/transactions but served under the /pos/*
 * prefix so it inherits POS CORS + device-code auth instead of admin auth.
 * The cashier-facing Transactions screen calls this every few seconds.
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const { since: sinceParam, until: untilParam } = req.query as Record<string, string>;
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const since = sinceParam ? new Date(sinceParam) : startOfDay;
    const until = untilParam ? new Date(untilParam) : now;

    let orders: any[] = [];
    try {
      const orderSvc = req.scope.resolve<any>("order");
      orders = await orderSvc.listOrders(
        { created_at: { $gte: since, $lte: until } },
        { take: 5000, order: { created_at: "DESC" } },
      );
    } catch {}

    const schoolSvc = req.scope.resolve<any>(MODULE_KEYS.SCHOOL);
    const allSchools = await schoolSvc.listSchools({});
    const schoolById: Record<string, { code: string; name: string }> = {};
    for (const s of allSchools) schoolById[s.id] = { code: s.code, name: s.name };

    const byPayment = new Map<string, any>();
    const bySchool = new Map<string, any>();
    const byCashier = new Map<string, any>();
    const byHour = new Map<string, any>();
    let totalGross = 0;

    for (const o of orders) {
      const amt = Number(o.total ?? 0);
      const mode = o.metadata?.payment_mode ?? "cash";
      const schoolId = o.metadata?.school_id ?? "_unassigned";
      const cashierId = o.metadata?.pos_cashier_id ?? "_unknown";
      const hourKey = new Date(o.created_at).toISOString().slice(0, 13);
      totalGross += amt;

      const pm = byPayment.get(mode) ?? { mode, count: 0, gross: 0 };
      pm.count++; pm.gross += amt;
      byPayment.set(mode, pm);

      const sc = bySchool.get(schoolId) ?? {
        school_id: schoolId,
        school_code: schoolById[schoolId]?.code,
        school_name: schoolById[schoolId]?.name,
        count: 0,
        gross: 0,
      };
      sc.count++; sc.gross += amt;
      bySchool.set(schoolId, sc);

      const cs = byCashier.get(cashierId) ?? { cashier_id: cashierId, count: 0, gross: 0 };
      cs.count++; cs.gross += amt;
      byCashier.set(cashierId, cs);

      const hr = byHour.get(hourKey) ?? { hour: hourKey, count: 0, gross: 0 };
      hr.count++; hr.gross += amt;
      byHour.set(hourKey, hr);
    }

    const recent = orders.slice(0, 20).map((o) => ({
      id: o.id,
      display_id: o.display_id ?? o.id?.slice?.(-8),
      local_order_number: o.metadata?.pos_local_order_number,
      total: Number(o.total ?? 0),
      payment_mode: o.metadata?.payment_mode ?? "cash",
      payment_reference: o.metadata?.payment_reference ?? null,
      school_id: o.metadata?.school_id,
      school_code: schoolById[o.metadata?.school_id]?.code,
      cashier_id: o.metadata?.pos_cashier_id,
      student_name: o.metadata?.student_name,
      created_at: o.created_at,
    }));

    let unsyncedPending = 0;
    try {
      const sync = req.scope.resolve<any>(MODULE_KEYS.OFFLINE_SYNC);
      const pending = await sync.listSyncEvents({
        event_type: "order.created",
        status: ["pending", "failed"],
      });
      unsyncedPending = pending.length;
    } catch {}

    return ok(res, {
      window: {
        since: since.toISOString(),
        until: until.toISOString(),
        count: orders.length,
        gross_total: totalGross,
      },
      by_payment: Array.from(byPayment.values()).sort((a: any, b: any) => b.gross - a.gross),
      by_school: Array.from(bySchool.values()).sort((a: any, b: any) => b.gross - a.gross),
      by_cashier: Array.from(byCashier.values()).sort((a: any, b: any) => b.gross - a.gross),
      by_hour: Array.from(byHour.values()).sort((a: any, b: any) => a.hour.localeCompare(b.hour)),
      recent,
      unsynced_pending: unsyncedPending,
    });
  } catch (err) {
    return serverError(res, err);
  }
}
