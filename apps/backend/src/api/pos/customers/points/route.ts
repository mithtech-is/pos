import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";
import { ok, badRequest, serverError } from "../../../_utils/response";

/**
 * POST /pos/customers/points
 * Body: { phone, name?, spent, redeem_points?, earn_rupees_per_point? }
 *
 * Records a sale against a customer's loyalty account: redeems points first
 * (capped at the balance), earns floor(spent / rupeesPerPoint) new points,
 * bumps total_spent + visits. Upserts the customer if they don't exist yet.
 * Returns the new balance. Called best-effort at checkout (online only).
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as {
    phone?: string;
    name?: string;
    spent?: number;
    redeem_points?: number;
    earn_rupees_per_point?: number;
  };
  const phone = (body.phone ?? "").trim();
  if (!phone) return badRequest(res, "phone is required");

  const spent = Math.max(0, Number(body.spent ?? 0));
  const redeem = Math.max(0, Math.floor(Number(body.redeem_points ?? 0)));
  const rupeesPerPoint = Math.max(1, Number(body.earn_rupees_per_point ?? 100));

  try {
    const customers = (req as any).scope.resolve(Modules.CUSTOMER);
    let [c] = await customers.listCustomers({ phone });
    if (!c) {
      const created = await customers.createCustomers({
        first_name: (body.name ?? "Guest").trim() || "Guest",
        phone,
        email: `pos.${phone}@counterflow.local`,
        metadata: { loyalty_points: 0, total_spent: 0, visits: 0 },
      });
      c = Array.isArray(created) ? created[0] : created;
    }

    const m = c.metadata ?? {};
    const current = Number(m.loyalty_points ?? 0);
    const redeemed = Math.min(redeem, current); // never redeem more than balance
    const earned = Math.floor(spent / rupeesPerPoint);
    const loyalty_points = current - redeemed + earned;
    const total_spent = Number(m.total_spent ?? 0) + spent;
    const visits = Number(m.visits ?? 0) + 1;

    await customers.updateCustomers(c.id, {
      metadata: {
        ...m,
        loyalty_points,
        total_spent,
        visits,
        last_visit: new Date().toISOString(),
      },
    });

    return ok(res, { phone, loyalty_points, earned, redeemed, total_spent, visits });
  } catch (err) {
    return serverError(res, err);
  }
}
