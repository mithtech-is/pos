import { settings, users } from "../db/repositories";
import { useAuthStore } from "./auth";
import { tick } from "../sync";
import { DEFAULT_BACKEND_URL } from "../config";

export interface SsoParams {
  token: string;
  email?: string;
  name?: string;
  /** Optional override for the POS backend base URL (defaults to the stored one). */
  backendUrl?: string;
}

/**
 * Sign in via the FieldSales SSO bridge.
 *
 * Mirrors LoginScreen.loginOnline's persistence so the rest of the app — the
 * sync worker, the offline PIN cache, and the auth gate in App.tsx — behaves
 * exactly as it does after a normal online login. The backend issues a device
 * registration token alongside the session (it auto-registers a device for the
 * rep), which we persist so subsequent sync pushes authenticate.
 *
 * Throws on failure; the caller surfaces the message and leaves the user on the
 * login screen.
 */
export async function signInWithSso(params: SsoParams): Promise<void> {
  const base =
    (params.backendUrl && params.backendUrl.trim()) ||
    (await settings.get<string>("backend_url")) ||
    DEFAULT_BACKEND_URL;

  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(`${base}/pos/auth/sso`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: params.token,
        email: params.email,
        name: params.name,
      }),
      signal: ctrl.signal,
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok || payload?.success === false) {
      throw new Error(payload?.error?.message ?? `HTTP ${res.status}`);
    }
    const data = payload.data ?? payload;

    await settings.set("backend_url", base);
    if (data.device_code) await settings.set("device_code", data.device_code);
    if (data.device_token) await settings.set("device_token", data.device_token);
    await settings.set("access_token", data.access_token);

    await users.upsert({
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      role: data.user.role,
      offline_access_expires_at: data.user.offline_access_expires_at,
      pin_hash: data.offline_pin_hash,
    });

    useAuthStore.getState().setUser({
      id: data.user.id,
      name: data.user.name,
      email: data.user.email,
      role: data.user.role,
    });

    void tick();
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Parse an inbound deep link of the form
 * `counterflowpos://sso?token=...&email=...&name=...` (scheme-agnostic — only the
 * `sso` route + a `token` are required, so it tolerates future scheme renames).
 * Returns null for any URL that isn't the SSO route or is missing a token.
 */
export function parseSsoUrl(url: string): SsoParams | null {
  if (!url) return null;
  // Strip the scheme so we can match the route segment regardless of how many
  // slashes the platform normalises it to.
  const withoutScheme = url.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "");
  const [routePart, queryPart = ""] = withoutScheme.split("?");
  const route = routePart.replace(/\/+$/, "");
  if (route !== "sso") return null;

  const out: Record<string, string> = {};
  for (const pair of queryPart.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    const rawVal = eq === -1 ? "" : pair.slice(eq + 1);
    try {
      out[decodeURIComponent(rawKey)] = decodeURIComponent(rawVal);
    } catch {
      out[rawKey] = rawVal;
    }
  }
  if (!out.token) return null;
  return {
    token: out.token,
    email: out.email,
    name: out.name,
    backendUrl: out.backend,
  };
}
