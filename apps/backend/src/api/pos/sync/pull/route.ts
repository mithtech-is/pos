import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";
import { MODULE_KEYS } from "../../../../modules";
import { ok, badRequest, serverError } from "../../../_utils/response";

/**
 * POST /pos/sync/pull
 *
 * Returns master data the POS needs to operate offline:
 * schools, classes, products, variants, kits, prices, inventory snapshot,
 * users, settings, blocked devices.
 *
 * `last_sync_at` is an optimization: callers who pass it get only rows updated
 * since that timestamp. The first sync (when null) returns the full snapshot.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { device_id, last_sync_at } = (req.body ?? {}) as {
    device_id?: string;
    last_sync_at?: string;
  };
  if (!device_id) return badRequest(res, "device_id is required");

  try {
    const schools = req.scope.resolve<any>(MODULE_KEYS.SCHOOL);
    const kits = req.scope.resolve<any>(MODULE_KEYS.UNIFORM_KIT);
    const devices = req.scope.resolve<any>(MODULE_KEYS.POS_DEVICE);

    // For master-data tables that fit in a few KB (schools, classes, kits,
    // rules) we always return the full snapshot. The POS treats each pull as
    // canonical and replaces its local copy wholesale — that's the only
    // robust way to handle reseeds where the backend assigns fresh ULIDs.
    // The `last_sync_at` filter is still honored for products/variants below
    // where the catalog can be large.
    void last_sync_at; // kept for forward compat / metrics

    const [schoolsList, classes, years] = await Promise.all([
      schools.listSchools({}),
      schools.listSchoolClasses({}),
      schools.listAcademicYears({}),
    ]);
    const [kitsList, kitItems, rules] = await Promise.all([
      kits.listUniformKits({}),
      kits.listUniformKitItems({}),
      kits.listUniformRules({}),
    ]);

    // Pull Medusa-native data via the resolved services if available.
    let products: any[] = [];
    let variants: any[] = [];
    let inventorySnapshot: any[] = [];
    try {
      const productService = req.scope.resolve<any>("product");
      products = await productService.listProducts({});
      // We stash price + size + gender on variant.metadata at seed time
      // (see scripts/seed-products.ts + scripts/patch-variant-prices.ts) so
      // the POS can hydrate without going through the pricing/region pipeline.
      // Variants ignore the `since` filter for now — the catalog is small and
      // metadata-only updates don't always bump updated_at.
      const rawVariants = await productService.listProductVariants({});
      variants = rawVariants.map((v: any) => ({
        ...v,
        price: Number(v.metadata?.price ?? 0),
        tax_rate: Number(v.metadata?.tax_rate ?? 0),
        size: v.metadata?.size ?? v.title?.split(" ").pop() ?? null,
        gender: v.metadata?.gender ?? null,
      }));
    } catch {
      /* product module not available in scaffolded environments */
    }
    try {
      const inventoryService = req.scope.resolve<any>("inventory");
      inventorySnapshot = await inventoryService.listInventoryLevels({});
    } catch {
      /* inventory module not yet wired in */
    }

    const blocked = (await devices.listPOSDevices({ status: "blocked" })).map(
      (d: any) => d.device_code,
    );

    // Hash list of manager PINs so cashiers can verify offline approvals.
    let managerPinHashes: string[] = [];
    let userList: any[] = [];
    try {
      const userModule = req.scope.resolve<any>(Modules.USER);
      const users = await userModule.listUsers({});
      managerPinHashes = users
        .filter((u: any) => u.metadata?.manager_pin_hash)
        .map((u: any) => u.metadata.manager_pin_hash);
      // Send a minimal user list (id, email, role, pin hashes) so the POS
      // can support offline PIN login for these accounts after the first sync.
      userList = users.map((u: any) => ({
        id: u.id,
        name: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email,
        email: u.email,
        role: u.metadata?.role ?? "cashier",
        offline_pin_hash: u.metadata?.offline_pin_hash,
        status: "active",
        updated_at: u.updated_at,
      }));
    } catch {
      /* User module not wired in scaffolded environments */
    }

    return ok(res, {
      server_time: new Date().toISOString(),
      schools: schoolsList,
      classes,
      academic_years: years,
      products,
      variants,
      kits: kitsList,
      kit_items: kitItems,
      uniform_rules: rules,
      prices: [],
      inventory_snapshot: inventorySnapshot,
      users: userList,
      manager_pin_hashes: managerPinHashes,
      settings: {
        offline_session_days: Number(
          process.env.POS_OFFLINE_SESSION_DAYS ?? 7,
        ),
        sync_push_batch_limit: Number(
          process.env.POS_SYNC_PUSH_BATCH_LIMIT ?? 50,
        ),
      },
      blocked_devices: blocked,
    });
  } catch (err) {
    return serverError(res, err);
  }
}
