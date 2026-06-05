import * as Crypto from "expo-crypto";
import uuidv4 from "react-native-uuid";
import { AppState, AppStateStatus } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import {
  DEFAULT_SYNC_TICK_MS,
  SYNC_PUSH_BATCH_SIZE,
  SYNC_MAX_RETRIES,
} from "@pos/shared";
import { masterData, orders, settings, syncQueue, users } from "./db/repositories";
import { DEFAULT_BACKEND_URL } from "./config";

/**
 * Foreground sync worker for the mobile POS.
 *
 * Differences from the Electron version:
 *   - Runs in the JS context (no main process). Ticks while the app is open
 *     and the tab is focused.
 *   - Uses fetch + AbortController for connectivity probes (no Electron `net`).
 *
 * The protocol is identical: pull master data, then push pending events with
 * idempotency keys. Pull responses with a non-undefined `schools` field are
 * treated as full-snapshot replacements (same as Electron).
 */
export interface SyncState {
  online: boolean;
  in_progress: boolean;
  paused: boolean;
  last_pull_at: string | null;
  last_push_at: string | null;
}

const state: SyncState = {
  online: false,
  in_progress: false,
  paused: false,
  last_pull_at: null,
  last_push_at: null,
};

const listeners = new Set<(s: SyncState) => void>();
let timer: ReturnType<typeof setInterval> | null = null;

export function onSyncState(cb: (s: SyncState) => void): () => void {
  listeners.add(cb);
  cb({ ...state });
  return () => listeners.delete(cb);
}

function emit() {
  for (const l of listeners) l({ ...state });
}

async function backendUrl(): Promise<string> {
  const stored = await settings.get<string>("backend_url");
  return stored ?? DEFAULT_BACKEND_URL;
}

async function deviceCode(): Promise<string> {
  return (await settings.get<string>("device_code")) ?? "POS001";
}

async function deviceToken(): Promise<string | null> {
  return await settings.get<string>("device_token");
}

async function fetchJson(path: string, init: RequestInit = {}): Promise<any> {
  const base = await backendUrl();
  const code = await deviceCode();
  const token = await deviceToken();
  const url = path.startsWith("http") ? path : `${base}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-pos-device-code": code,
    ...((init.headers as Record<string, string>) ?? {}),
  };
  if (token) headers["x-pos-device-token"] = token;
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

async function probeConnectivity(): Promise<boolean> {
  try {
    const base = await backendUrl();
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${base}/health`, { signal: ctrl.signal }).catch(() => null);
    clearTimeout(t);
    state.online = !!(res && res.ok);
    return state.online;
  } catch {
    state.online = false;
    return false;
  }
}

async function pullSync(): Promise<void> {
  try {
    const lastSync = await settings.get<string>("last_pull_at");
    const code = await deviceCode();
    const response = await fetchJson("/pos/sync/pull", {
      method: "POST",
      body: JSON.stringify({ device_id: code, last_sync_at: lastSync ?? null }),
    });
    const snapshot = response.data ?? response;
    await masterData.upsertFromPullSync(snapshot);
    state.last_pull_at = new Date().toISOString();
    await settings.set("last_pull_at", state.last_pull_at);
  } catch (err) {
    // Pull failures are non-fatal — keep working with cached data.
    console.warn("[sync] pull failed:", (err as Error).message);
  }
}

async function pushBatch(): Promise<void> {
  const pending = await syncQueue.listPending(SYNC_PUSH_BATCH_SIZE);
  if (pending.length === 0) return;
  const retryable = pending.filter(
    (e: any) => (e.retry_count ?? 0) < SYNC_MAX_RETRIES,
  );
  if (retryable.length === 0) return;
  await syncQueue.markSyncing(retryable.map((e: any) => e.id));

  const batchId = `batch_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${String(uuidv4.v4()).slice(0, 8)}`;
  const code = await deviceCode();
  try {
    const response = await fetchJson("/pos/sync/push", {
      method: "POST",
      body: JSON.stringify({
        device_id: code,
        batch_id: batchId,
        events: retryable.map((e: any) => ({
          event_type: e.event_type,
          idempotency_key: e.idempotency_key,
          payload: e.payload,
        })),
      }),
    });
    const data = response.data ?? response;
    const byKey = new Map(retryable.map((e: any) => [e.idempotency_key, e]));
    for (const result of data.results ?? []) {
      const row = byKey.get(result.idempotency_key);
      if (!row) continue;
      if (result.status === "synced" || result.status === "duplicate") {
        await syncQueue.markSynced(row.id, result.server_order_id);
        if (row.event_type === "order.created") {
          const local = (await orders.list({ sync_status: "pending", limit: 500 })).find(
            (o: any) => o.idempotency_key === result.idempotency_key,
          );
          if (local) await orders.markSynced(local.id, result.server_order_id);
        }
      } else if (result.status === "conflict") {
        await syncQueue.markConflict(row.id, result.error_message ?? "conflict");
      } else {
        await syncQueue.markFailed(row.id, result.error_message ?? "unknown_error");
      }
    }
    state.last_push_at = new Date().toISOString();
    await settings.set("last_push_at", state.last_push_at);
  } catch (err) {
    const message = (err as Error).message;
    for (const r of retryable) await syncQueue.markFailed(r.id, message);
    console.warn("[sync] push failed:", message);
  }
}

export async function tick(): Promise<void> {
  if (state.paused || state.in_progress) return;
  state.in_progress = true;
  try {
    const online = await probeConnectivity();
    if (!online) return;
    await pullSync();
    await pushBatch();
  } finally {
    state.in_progress = false;
    emit();
  }
}

/* ──────────────────────────────────────────────────────────────────
 * Reactive triggers — fire `tick()` on three events instead of just
 * polling on a 30-second timer:
 *
 *   1. Periodic timer (existing behavior) — safety net.
 *   2. Radio comes back online (NetInfo)  — sync the moment the phone
 *      reconnects to wifi/4G.
 *   3. App foreground (AppState 'active') — when the cashier brings
 *      the POS back to the front, push any backlog immediately.
 *
 * We dedupe so multiple events in quick succession only fire one tick
 * (the in-flight guard inside `tick()` does this).
 * ───────────────────────────────────────────────────────────────── */

let netinfoUnsub: (() => void) | null = null;
let appstateSub: { remove: () => void } | null = null;
let wasOnline = false;
let wasActive = AppState.currentState === "active";

function attachReactiveTriggers() {
  // Net come-back-online → tick.
  netinfoUnsub = NetInfo.addEventListener((s) => {
    const isOnline = !!s.isConnected && s.isInternetReachable !== false;
    if (isOnline && !wasOnline) {
      // Edge: just transitioned offline → online. Fire an immediate sync.
      console.log("[sync] network back — ticking");
      void tick();
    }
    wasOnline = isOnline;
  });

  // App foreground → tick.
  appstateSub = AppState.addEventListener("change", (next: AppStateStatus) => {
    const isActive = next === "active";
    if (isActive && !wasActive) {
      console.log("[sync] app foregrounded — ticking");
      void tick();
    }
    wasActive = isActive;
  });
}

function detachReactiveTriggers() {
  netinfoUnsub?.();
  netinfoUnsub = null;
  appstateSub?.remove();
  appstateSub = null;
}

export function startSyncWorker(intervalMs?: number): void {
  stopSyncWorker();
  void tick();
  timer = setInterval(() => void tick(), intervalMs ?? DEFAULT_SYNC_TICK_MS);
  attachReactiveTriggers();
}

export function stopSyncWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
  detachReactiveTriggers();
}

/** Public hook — UI can call this to force a sync attempt (e.g. on
 *  pull-to-refresh or after a manual order entry). */
export function triggerSync(): void {
  void tick();
}

export function pauseSyncWorker(paused: boolean): void {
  state.paused = paused;
  emit();
}

export function getSyncState(): SyncState {
  return { ...state };
}

/**
 * Manager-PIN verification: tries backend if online, falls back to the locally
 * cached manager_pin_hashes (hydrated during pull sync). Uses a JS port of
 * the same salted-SHA256 verification the Electron app uses.
 *
 * Web crypto in Hermes (Expo) doesn't expose subtle.digest synchronously,
 * so we use a small async SHA-256 helper via expo-crypto. Imported lazily
 * to keep the cold path small.
 */
export async function verifyManagerPin(pin: string, action?: string): Promise<{
  ok: boolean;
  source: "online" | "offline";
  manager_user_id?: string;
}> {
  if (state.online) {
    try {
      const res = await fetchJson("/pos/auth/verify-manager-pin", {
        method: "POST",
        body: JSON.stringify({ pin, action }),
      });
      const d = res.data ?? res;
      return { ok: !!d?.ok, source: "online", manager_user_id: d?.manager_user_id };
    } catch {
      /* fall through to offline */
    }
  }
  const hashes = (await settings.get<string[]>("manager_pin_hashes")) ?? [];
  for (const h of hashes) {
    const [scheme, salt, digest] = h.split("$");
    if (scheme !== "sha256" || !salt || !digest) continue;
    const candidate = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      salt + pin,
      { encoding: Crypto.CryptoEncoding.HEX },
    );
    if (candidate.toLowerCase() === digest.toLowerCase()) {
      return { ok: true, source: "offline" };
    }
  }
  return { ok: false, source: "offline" };
}
