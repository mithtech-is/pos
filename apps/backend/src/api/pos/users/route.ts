import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";
import { ok, serverError } from "../../_utils/response";

/**
 * POS users for the manager-facing "Users & Branches" admin screen.
 *
 * Role and branch assignment live on the Medusa user's `metadata`
 * (metadata.role, metadata.branch_ids). Managers/admins/owners always have
 * access to every branch; a cashier with one or more `branch_ids` is scoped to
 * exactly those branches (empty = unrestricted). See PATCH-style assignment in
 * ./[id]/branches/route.ts.
 */
export function toAdminUser(u: any) {
  return {
    id: u.id,
    name: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email,
    email: u.email,
    role: u.metadata?.role ?? "cashier",
    branch_ids: Array.isArray(u.metadata?.branch_ids) ? u.metadata.branch_ids : [],
    status: "active",
  };
}

/** GET /pos/users — list every POS user with their role + assigned branches. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const userModule = req.scope.resolve<any>(Modules.USER);
    const users = await userModule.listUsers({});
    return ok(
      res,
      users.map(toAdminUser).sort((a: any, b: any) => a.name.localeCompare(b.name)),
    );
  } catch (err) {
    return serverError(res, err);
  }
}
