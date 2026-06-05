import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { MODULE_KEYS } from "../../../modules";
import { ok, badRequest, serverError } from "../../_utils/response";

/**
 * Stores / outlets for multi-store (franchise) setups. Backed by the existing
 * outlet module (legacy "school" key, reused as a store/branch). Each POS sale
 * is already tagged with a store, so this lets you run several branches and
 * report per store.
 */
function toStore(s: any) {
  return {
    id: s.id,
    name: s.name,
    code: s.code,
    city: s.city ?? null,
    area: s.area ?? null,
    status: s.status ?? "active",
  };
}

/** GET /pos/stores — list all outlets. */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    const svc = (req as any).scope.resolve(MODULE_KEYS.SCHOOL);
    const list = await svc.listSchools({});
    return ok(res, list.map(toStore).sort((a: any, b: any) => a.name.localeCompare(b.name)));
  } catch (err) {
    return serverError(res, err);
  }
}

/** POST /pos/stores { name, code, city? } — create an outlet. */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const body = (req.body ?? {}) as { name?: string; code?: string; city?: string };
  const name = (body.name ?? "").trim();
  const code = (body.code ?? "").trim().toUpperCase();
  if (!name || !code) return badRequest(res, "name and code are required");
  try {
    const svc = (req as any).scope.resolve(MODULE_KEYS.SCHOOL);
    const existing = await svc.listSchools({ code });
    if (existing?.length) return badRequest(res, "a store with that code already exists");
    const created = await svc.createSchools({
      name,
      code,
      city: (body.city ?? "").trim() || null,
      status: "active",
    });
    const store = Array.isArray(created) ? created[0] : created;
    return ok(res, toStore(store), 201);
  } catch (err) {
    return serverError(res, err);
  }
}
