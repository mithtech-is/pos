import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";
import { ok, badRequest, notFound, serverError } from "../../_utils/response";

/**
 * POS customer / loyalty lookup + upsert, backed by Medusa's Customer module.
 * Loyalty state lives in customer.metadata: { loyalty_points, total_spent,
 * visits, last_visit }. Customers are keyed by phone for the POS.
 */
function toProfile(c: any) {
  const m = c.metadata ?? {};
  return {
    id: c.id,
    name: [c.first_name, c.last_name].filter(Boolean).join(" ") || c.first_name || "",
    phone: c.phone ?? null,
    email: c.email ?? null,
    loyalty_points: Number(m.loyalty_points ?? 0),
    total_spent: Number(m.total_spent ?? 0),
    visits: Number(m.visits ?? 0),
    last_visit: m.last_visit ?? null,
  };
}

/** GET /pos/customers?phone=98XXXXXXXX — look up a customer by phone. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const phone = String((req.query?.phone ?? "")).trim();
  if (!phone) return badRequest(res, "phone query param is required");
  try {
    const customers = (req as any).scope.resolve(Modules.CUSTOMER);
    const [c] = await customers.listCustomers({ phone });
    if (!c) return notFound(res, "No customer with that phone");
    return ok(res, toProfile(c));
  } catch (err) {
    return serverError(res, err);
  }
}

/** POST /pos/customers { name, phone } — create or update a customer. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as { name?: string; phone?: string };
  const phone = (body.phone ?? "").trim();
  const name = (body.name ?? "").trim();
  if (!phone) return badRequest(res, "phone is required");
  try {
    const customers = (req as any).scope.resolve(Modules.CUSTOMER);
    const [existing] = await customers.listCustomers({ phone });
    if (existing) {
      if (name && !existing.first_name) {
        await customers.updateCustomers(existing.id, { first_name: name });
        const [fresh] = await customers.listCustomers({ phone });
        return ok(res, toProfile(fresh ?? existing));
      }
      return ok(res, toProfile(existing));
    }
    const created = await customers.createCustomers({
      first_name: name || "Guest",
      phone,
      email: `pos.${phone}@counterflow.local`,
      metadata: { loyalty_points: 0, total_spent: 0, visits: 0 },
    });
    const c = Array.isArray(created) ? created[0] : created;
    return ok(res, toProfile(c), 201);
  } catch (err) {
    return serverError(res, err);
  }
}
