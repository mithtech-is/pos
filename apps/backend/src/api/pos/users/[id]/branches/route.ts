import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";
import { MODULE_KEYS } from "../../../../../modules";
import { ok, badRequest, notFound, serverError } from "../../../../_utils/response";

/**
 * POST /pos/users/:id/branches  { branch_ids: string[] }
 *
 * Assign which branches (outlets/stores) a user is scoped to. Stored on
 * user.metadata.branch_ids (merged so role / PIN hashes are preserved).
 * An empty array clears the restriction (user can then see all branches).
 * Every id is validated against real outlets so we never persist a dangling id.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const id = (req.params as any)?.id as string | undefined;
  const body = (req.body ?? {}) as { branch_ids?: unknown };
  if (!id) return badRequest(res, "user id is required");
  if (!Array.isArray(body.branch_ids)) {
    return badRequest(res, "branch_ids (array of outlet ids) is required");
  }
  const branchIds = Array.from(
    new Set(body.branch_ids.filter((b): b is string => typeof b === "string" && b.length > 0)),
  );

  try {
    const userModule = req.scope.resolve<any>(Modules.USER);
    const [user] = await userModule.listUsers({ id });
    if (!user) return notFound(res, "user not found");

    // Validate every id refers to a real outlet so we never store junk.
    if (branchIds.length) {
      const schoolSvc = req.scope.resolve<any>(MODULE_KEYS.SCHOOL);
      const schools = await schoolSvc.listSchools({});
      const valid = new Set(schools.map((s: any) => s.id));
      const unknown = branchIds.filter((b) => !valid.has(b));
      if (unknown.length) {
        return badRequest(res, `unknown branch id(s): ${unknown.join(", ")}`);
      }
    }

    const metadata = { ...(user.metadata ?? {}), branch_ids: branchIds };
    await userModule.updateUsers({ id, metadata });

    return ok(res, {
      id,
      role: (user.metadata as any)?.role ?? "cashier",
      branch_ids: branchIds,
    });
  } catch (err) {
    return serverError(res, err);
  }
}
