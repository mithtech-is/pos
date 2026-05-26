import { defineMiddlewares } from "@medusajs/framework";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cors = require("cors") as (opts: any) => any;

/**
 * Per-route middleware wiring.
 *
 * Medusa core applies CORS to /store/*, /admin/*, /auth/* using the values
 * in medusa-config.ts. Our custom /pos/* prefix isn't covered there, so we
 * attach a dedicated cors() middleware here.
 *
 * For /pos/* we allow ANY origin (`origin: true`). These routes are not
 * browser-secured — they're authenticated by the device registration token
 * (header `x-pos-device-token`) and the user's JWT (header `Authorization`).
 * CORS only matters for browser-based clients; React Native, Electron, and
 * curl don't enforce same-origin to begin with. Being permissive here means
 * the POS works whether the cashier is on a Vite dev page (Origin =
 * http://localhost:5173), an Electron build (Origin = app://.), a phone on
 * the same LAN (Origin = the device's URL), or a packaged native app (no
 * Origin header at all).
 */

export default defineMiddlewares({
  routes: [
    {
      matcher: "/pos/*",
      middlewares: [
        cors({
          origin: true,
          credentials: true,
          allowedHeaders: [
            "Content-Type",
            "Authorization",
            "x-pos-device-code",
            "x-pos-device-token",
          ],
          methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        }),
        async (req: any, _res: any, next: any) => {
          // Capture POS device headers for downstream use.
          req.pos_device_code = req.headers["x-pos-device-code"];
          req.pos_device_token = req.headers["x-pos-device-token"];
          next();
        },
      ],
    },
  ],
});
