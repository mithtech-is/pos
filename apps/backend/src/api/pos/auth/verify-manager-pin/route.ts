import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";
import crypto from "node:crypto";
import { ok, badRequest, unauthorized, serverError } from "../../../_utils/response";

/**
 * POST /pos/auth/verify-manager-pin
 *
 * Used for sensitive actions when the device is online. Cashier triggers
 * a sensitive action → POS shows the PIN modal → modal POSTs here → backend
 * checks the PIN against every user with role=manager.
 *
 * For OFFLINE PIN verification, the POS uses its local cached
 * `manager_pin_hashes` setting (hydrated during pull sync) and the same
 * salted-SHA256 algorithm we use here.
 *
 * Returns { ok, manager_user_id } on success so the audit log can attribute
 * the approval to a specific manager.
 */
function checkPin(hash: string, candidate: string): boolean {
  const [scheme, salt, digest] = hash.split("$");
  if (scheme !== "sha256" || !salt || !digest) return false;
  const c = crypto.createHash("sha256").update(salt + candidate).digest("hex");
  // timing-safe compare
  if (c.length !== digest.length) return false;
  return crypto.timingSafeEqual(Buffer.from(c, "hex"), Buffer.from(digest, "hex"));
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { pin, action } = (req.body ?? {}) as { pin?: string; action?: string };
  if (!pin) return badRequest(res, "pin is required");

  try {
    const userModule = req.scope.resolve<any>(Modules.USER);
    const users = await userModule.listUsers({});
    const managers = users.filter(
      (u: any) => u.metadata?.role === "manager" && u.metadata?.manager_pin_hash,
    );
    for (const m of managers) {
      if (checkPin(m.metadata.manager_pin_hash, pin)) {
        // Audit the approval.
        try {
          const audit = req.scope.resolve<any>("auditLogModuleService");
          await audit.log({
            user_id: m.id,
            action: `manager.approve.${action ?? "unknown"}`,
            entity_type: "manager_approval",
            new_value: { action },
            source: "online",
          });
        } catch {
          /* audit is best-effort */
        }
        return ok(res, { ok: true, manager_user_id: m.id, manager_email: m.email });
      }
    }
    return unauthorized(res, "PIN did not match any manager");
  } catch (err) {
    return serverError(res, err);
  }
}
