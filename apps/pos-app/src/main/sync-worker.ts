import { IpcMain, net } from "electron";
import { v4 as uuidv4 } from "uuid";
import { DEFAULT_SYNC_TICK_MS, SYNC_PUSH_BATCH_SIZE, SYNC_MAX_RETRIES } from "@pos/shared";
import { repositories } from "./db";

/**
 * Sync worker.
 *
 * Runs in the Electron main process. Every tick:
 *   1. Probe connectivity by HEAD-ing the backend.
 *   2. If online, pull master data when stale.
 *   3. If pending events exist, push a batch.
 *   4. Apply per-event results to the queue (synced / failed / conflict).
 *
 * The renderer never talks to the backend directly — all network I/O is
 * funneled through here, which keeps idempotency and offline detection in
 * one place.
 */

interface SyncWorkerState {
  online: boolean;
  last_pull_at: string | null;
  last_push_at: string | null;
  in_progress: boolean;
  paused: boolean;
}

const state: SyncWorkerState = {
  online: false,
  last_pull_at: null,
  last_push_at: null,
  in_progress: false,
  paused: false,
};

let timer: NodeJS.Timeout | null = null;
let listeners: Array<(s: SyncWorkerState) => void> = [];

function backendUrl(): string {
  return (
    repositories.settings().get<string>("backend_url") ??
    process.env.VITE_BACKEND_URL ??
    "http://localhost:9000"
  );
}

function deviceCode(): string {
  return (
    repositories.settings().get<string>("device_code") ??
    process.env.VITE_DEVICE_CODE ??
    "POS001"
  );
}

function deviceToken(): string | null {
  return repositories.settings().get<string>("device_token") ?? null;
}

async function fetchJson(url: string, init: any = {}): Promise<any> {
  const fullUrl = url.startsWith("http") ? url : `${backendUrl()}${url}`;
  const headers = {
    "Content-Type": "application/json",
    "x-pos-device-code": deviceCode(),
    ...(deviceToken() ? { "x-pos-device-token": deviceToken()! } : {}),
    ...(init.headers ?? {}),
  };
  const res = await fetch(fullUrl, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

async function probeConnectivity(): Promise<boolean> {
  try {
    // /health is a Medusa convention; fall back to the pull endpoint if it
    // doesn't exist. We deliberately use HEAD/short timeout to keep ticks cheap.
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${backendUrl()}/health`, {
      method: "GET",
      signal: ctrl.signal,
    }).catch(() => null);
    clearTimeout(t);
    state.online = !!(res && res.ok) || net.isOnline?.() === true;
    return state.online;
  } catch {
    state.online = false;
    return false;
  }
}

async function pullSync() {
  try {
    const lastSync = repositories.settings().get<string>("last_pull_at");
    const response = await fetchJson("/pos/sync/pull", {
      method: "POST",
      body: JSON.stringify({
        device_id: deviceCode(),
        last_sync_at: lastSync ?? null,
      }),
    });
    const snapshot = response.data ?? response;
    repositories.masterData().upsertFromPullSync(snapshot);
    if (snapshot.inventory_snapshot?.length) {
      for (const inv of snapshot.inventory_snapshot) {
        repositories.inventory().upsertSnapshot({
          variant_id: inv.inventory_item_id ?? inv.variant_id,
          stock_location_id: inv.location_id ?? "default",
          last_synced_quantity: inv.stocked_quantity ?? inv.last_synced_quantity ?? 0,
        });
      }
    }
    // Hydrate users with hashed PINs so offline PIN login works after this sync.
    if (Array.isArray(snapshot.users)) {
      for (const u of snapshot.users) {
        if (!u.email) continue;
        repositories.users().upsert({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          offline_access_expires_at: new Date(
            Date.now() + 7 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          pin_hash: u.offline_pin_hash,
          branch_ids: Array.isArray(u.branch_ids) ? u.branch_ids : [],
        });
      }
    }
    // Cache the manager PIN hashes for offline manager-PIN verification.
    if (Array.isArray(snapshot.manager_pin_hashes)) {
      repositories
        .settings()
        .set("manager_pin_hashes", snapshot.manager_pin_hashes);
    }
    state.last_pull_at = new Date().toISOString();
    repositories.settings().set("last_pull_at", state.last_pull_at);
  } catch (err) {
    // Pull failures are non-fatal: we keep working with whatever master data we have.
    console.warn("[sync] pull failed:", (err as Error).message);
  }
}

async function pushBatch() {
  const pending = repositories.syncQueue().listPending(SYNC_PUSH_BATCH_SIZE);
  if (pending.length === 0) return;

  // Stop infinite retry loops — events that have failed too many times need
  // human review (which the conflict screen surfaces).
  const retryable = pending.filter(
    (e: any) => (e.retry_count ?? 0) < SYNC_MAX_RETRIES,
  );
  if (retryable.length === 0) return;

  repositories.syncQueue().markSyncing(retryable.map((e: any) => e.id));

  const batchId = `batch_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${uuidv4().slice(0, 8)}`;
  try {
    const response = await fetchJson("/pos/sync/push", {
      method: "POST",
      body: JSON.stringify({
        device_id: deviceCode(),
        batch_id: batchId,
        events: retryable.map((e: any) => ({
          event_type: e.event_type,
          idempotency_key: e.idempotency_key,
          payload: e.payload,
        })),
      }),
    });
    const data = response.data ?? response;

    const eventById = new Map(retryable.map((e: any) => [e.idempotency_key, e]));
    for (const result of data.results ?? []) {
      const queueRow = eventById.get(result.idempotency_key);
      if (!queueRow) continue;
      if (result.status === "synced" || result.status === "duplicate") {
        repositories.syncQueue().markSynced(queueRow.id, result.server_order_id);
        // Mirror status onto the orders table so the UI badges turn green.
        if (queueRow.event_type === "order.created") {
          const order = repositories
            .orders()
            .list({ sync_status: "pending", limit: 200 })
            .find((o: any) => o.idempotency_key === result.idempotency_key);
          if (order) {
            repositories
              .orders()
              .markSynced((order as any).id, result.server_order_id);
          }
        }
      } else if (result.status === "conflict") {
        repositories
          .syncQueue()
          .markConflict(queueRow.id, result.error_message ?? "conflict");
      } else {
        repositories
          .syncQueue()
          .markFailed(queueRow.id, result.error_message ?? "unknown_error");
      }
    }
    state.last_push_at = new Date().toISOString();
    repositories.settings().set("last_push_at", state.last_push_at);
  } catch (err) {
    const message = (err as Error).message;
    for (const row of retryable) {
      repositories.syncQueue().markFailed(row.id, message);
    }
    console.warn("[sync] push failed:", message);
  }
}

async function tick(): Promise<void> {
  if (state.paused || state.in_progress) return;
  state.in_progress = true;
  try {
    const online = await probeConnectivity();
    if (!online) return;
    await pullSync();
    await pushBatch();
  } finally {
    state.in_progress = false;
    notifyListeners();
  }
}

function notifyListeners() {
  for (const l of listeners) l({ ...state });
}

export function startSyncWorker(intervalMs?: number) {
  const tickMs = intervalMs ?? Number(process.env.VITE_SYNC_INTERVAL_MS ?? DEFAULT_SYNC_TICK_MS);
  stopSyncWorker();
  // Fire one tick right away so the UI doesn't sit on "Unknown" for 30s after launch.
  void tick();
  timer = setInterval(() => void tick(), tickMs);
}

export function stopSyncWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function pauseSyncWorker(paused: boolean) {
  state.paused = paused;
  notifyListeners();
}

export function registerSyncHandlers(ipc: IpcMain) {
  ipc.handle("sync:tick", () => tick());
  ipc.handle("sync:state", () => ({ ...state }));
  ipc.handle("sync:pause", (_e, paused: boolean) => {
    pauseSyncWorker(paused);
    return { paused: state.paused };
  });
  ipc.handle("sync:setBackendUrl", (_e, url: string) => {
    repositories.settings().set("backend_url", url);
    return { ok: true };
  });
  ipc.handle("sync:setDeviceCode", (_e, code: string) => {
    repositories.settings().set("device_code", code);
    return { ok: true };
  });
  ipc.handle("sync:setDeviceToken", (_e, token: string) => {
    repositories.settings().set("device_token", token);
    return { ok: true };
  });
  ipc.handle("sync:onlineStatus", () => ({ online: state.online }));

  /**
   * Scan-to-add: create a catalog product on the backend from a scanned
   * barcode + name + price, then immediately pull so the new product lands in
   * the local index and is scannable for billing. Requires the device to be
   * online (product creation is not queued offline).
   */
  ipc.handle(
    "pos:createProduct",
    async (
      _e,
      payload: { barcode: string; name: string; price: number; category?: string },
    ) => {
      if (!payload?.barcode || !payload?.name || !(Number(payload.price) > 0)) {
        return { ok: false, error: "barcode, name and a positive price are required" };
      }
      try {
        const r = await fetchJson("/pos/products", {
          method: "POST",
          body: JSON.stringify({
            barcode: payload.barcode,
            name: payload.name,
            price: Number(payload.price),
            category: payload.category,
          }),
        });
        const data = r.data ?? r;
        // Refresh the local catalog so the new barcode is scannable right away.
        await tick();
        return { ok: true, data };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  );

  /**
   * Loyalty / CRM. Online-only and best-effort: a failed lookup or award must
   * never block a sale (billing stays fully offline-capable).
   */
  ipc.handle("pos:lookupCustomer", async (_e, phone: string) => {
    try {
      const r = await fetchJson(`/pos/customers?phone=${encodeURIComponent(phone)}`);
      return { ok: true, data: r.data ?? r };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipc.handle(
    "pos:awardPoints",
    async (
      _e,
      payload: {
        phone: string;
        name?: string;
        spent: number;
        redeem_points?: number;
        earn_rupees_per_point?: number;
      },
    ) => {
      try {
        const r = await fetchJson("/pos/customers/points", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        return { ok: true, data: r.data ?? r };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    },
  );

  /**
   * Promotions. Fetched from the backend and cached locally so the cashier can
   * still apply a known coupon while offline.
   */
  ipc.handle("pos:listPromotions", async () => {
    try {
      const r = await fetchJson("/pos/promotions");
      const data = r.data ?? r;
      repositories.settings().set("promotions_cache", data);
      return { ok: true, data, source: "online" };
    } catch {
      const cached = repositories.settings().get<any[]>("promotions_cache") ?? [];
      return { ok: true, data: cached, source: "cache" };
    }
  });

  ipc.handle("pos:savePromotion", async (_e, promo: any) => {
    try {
      const r = await fetchJson("/pos/promotions", {
        method: "POST",
        body: JSON.stringify(promo),
      });
      const data = r.data ?? r;
      repositories.settings().set("promotions_cache", data);
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipc.handle("pos:deletePromotion", async (_e, id: string) => {
    try {
      const r = await fetchJson(`/pos/promotions/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = r.data ?? r;
      repositories.settings().set("promotions_cache", data);
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  /**
   * Inventory / suppliers / purchase orders — back-office, online-only.
   */
  const call = async (path: string, init?: any) => {
    try {
      const r = await fetchJson(path, init);
      return { ok: true, data: r.data ?? r };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  };
  ipc.handle("pos:listInventory", () => call("/pos/inventory"));
  ipc.handle("pos:updateInventory", (_e, body: any) =>
    call("/pos/inventory", { method: "POST", body: JSON.stringify(body) }),
  );
  ipc.handle("pos:listSuppliers", () => call("/pos/suppliers"));
  ipc.handle("pos:saveSupplier", (_e, body: any) =>
    call("/pos/suppliers", { method: "POST", body: JSON.stringify(body) }),
  );
  ipc.handle("pos:deleteSupplier", (_e, id: string) =>
    call(`/pos/suppliers/${encodeURIComponent(id)}`, { method: "DELETE" }),
  );
  ipc.handle("pos:listPurchaseOrders", () => call("/pos/purchase-orders"));
  ipc.handle("pos:savePurchaseOrder", (_e, body: any) =>
    call("/pos/purchase-orders", { method: "POST", body: JSON.stringify(body) }),
  );
  ipc.handle("pos:receivePurchaseOrder", (_e, id: string) =>
    call(`/pos/purchase-orders/${encodeURIComponent(id)}/receive`, { method: "POST" }),
  );

  // Stores / outlets (multi-store)
  ipc.handle("pos:listStores", () => call("/pos/stores"));
  ipc.handle("pos:saveStore", (_e, body: any) =>
    call("/pos/stores", { method: "POST", body: JSON.stringify(body) }),
  );
  ipc.handle("pos:setStoreActive", (_e, payload: { id: string; active: boolean }) =>
    call(`/pos/stores/${encodeURIComponent(payload.id)}`, {
      method: "POST",
      body: JSON.stringify({ active: payload.active }),
    }),
  );

  // Users & Branches (manager back-office; online — assignments live on the
  // backend user.metadata and are pulled down to every device on next sync).
  ipc.handle("pos:listUsersAdmin", () => call("/pos/users"));
  ipc.handle(
    "pos:setUserBranches",
    async (_e, payload: { id: string; branch_ids: string[] }) => {
      const r = await call(`/pos/users/${encodeURIComponent(payload.id)}/branches`, {
        method: "POST",
        body: JSON.stringify({ branch_ids: payload.branch_ids ?? [] }),
      });
      // Pull immediately so the new assignment is reflected in local_users
      // (and therefore in this device's outlet picker) right away.
      if (r.ok) await tick();
      return r;
    },
  );

  /**
   * Verify a manager PIN for a sensitive action. Tries the backend first; if
   * the device is offline we fall back to the locally-cached manager_pin_hashes
   * (last hydrated during pull sync).
   */
  ipc.handle(
    "auth:verifyManagerPin",
    async (_e, payload: { pin: string; action?: string }) => {
      const crypto = await import("node:crypto");
      const verifyLocally = () => {
        const hashes = repositories.settings().get<string[]>("manager_pin_hashes") ?? [];
        for (const h of hashes) {
          const [scheme, salt, digest] = h.split("$");
          if (scheme !== "sha256" || !salt || !digest) continue;
          const c = crypto.createHash("sha256").update(salt + payload.pin).digest("hex");
          if (c === digest) return { ok: true as const, source: "offline" as const };
        }
        return { ok: false as const, source: "offline" as const };
      };

      if (state.online) {
        try {
          const r = await fetchJson("/pos/auth/verify-manager-pin", {
            method: "POST",
            body: JSON.stringify({ pin: payload.pin, action: payload.action }),
          });
          const data = r.data ?? r;
          return { ok: !!data?.ok, source: "online", manager_user_id: data?.manager_user_id };
        } catch {
          /* fall through to offline */
        }
      }
      return verifyLocally();
    },
  );

  ipc.handle("sync:onLogin", async (_e, payload: { backend_url?: string; access_token?: string; user?: any }) => {
    if (payload.backend_url) repositories.settings().set("backend_url", payload.backend_url);
    if (payload.access_token) repositories.settings().set("access_token", payload.access_token);
    if (payload.user) {
      repositories.users().upsert({
        id: payload.user.id,
        name: payload.user.name,
        email: payload.user.email,
        role: payload.user.role,
        offline_access_expires_at: payload.user.offline_access_expires_at,
        pin_hash: payload.user.offline_pin_hash,
        branch_ids: Array.isArray(payload.user.branch_ids) ? payload.user.branch_ids : [],
      });
    }
    await tick();
    return { ok: true };
  });
}
