/**
 * Default POS backend base URL, baked into the APK at build time from
 * EXPO_PUBLIC_POS_BACKEND_URL (Expo inlines EXPO_PUBLIC_* vars). A physical
 * phone can't reach the dev PC's localhost, so set this to the PC's LAN IP in
 * apps/mobile-pos/.env. Falls back to localhost for emulator/simulator dev.
 *
 * This is only the DEFAULT — the backend URL can still be overridden on the
 * login/settings screen and is persisted to local settings thereafter. The
 * default matters most for the FieldSales SSO deep-link flow, which signs in
 * without ever showing the login screen (so there's no chance to type a URL).
 */
export const DEFAULT_BACKEND_URL =
  process.env.EXPO_PUBLIC_POS_BACKEND_URL ?? "http://localhost:9000";
