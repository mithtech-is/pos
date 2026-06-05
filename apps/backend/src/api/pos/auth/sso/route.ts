import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { MODULE_KEYS } from "../../../../modules";
import { registerPosDevice } from "../../../../workflows/register-pos-device";
import { ok, badRequest, unauthorized, serverError } from "../../../_utils/response";

/**
 * POST /pos/auth/sso
 *
 * Single sign-on bridge from the RoutePilot / FieldSales field-sales app. A
 * field rep taps "POS" in FieldSales, which deep-links into this app carrying
 * their FieldSales JWT. We verify that token offline against the SHARED
 * JWT_SECRET (both backends sign HS256 with the same secret — no
 * backend-to-backend call), then:
 *   1. auto-register a POS device for the rep (POS blocks login on unknown
 *      devices), reusing a stable per-rep device_code so re-entry is idempotent
 *   2. auto-provision a POS user keyed to the TRUSTED FieldSales user id
 *   3. mint POS access/refresh tokens — identical response shape to
 *      /pos/auth/login so the mobile client needs no special-casing
 *
 * SECURITY: identity comes ONLY from the verified token's `userId` claim. The
 * `email`/`name` body fields are attacker-controllable (they ride in the deep
 * link) and are used for display/profile only — never to resolve an account.
 */

interface FieldSalesClaims {
  userId?: string;
  organisationId?: string;
  role?: string;
}

// FieldSales role -> POS role. Reps run the till as dealers; managers/admins
// land as POS managers so they can approve sensitive actions.
function mapRole(fsRole: string | undefined): "cashier" | "manager" {
  return fsRole === "field_sales_representative" ? "cashier" : "manager";
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { token, email, name, device_code: bodyDeviceCode } = (req.body ?? {}) as {
    token?: string;
    email?: string;
    name?: string;
    device_code?: string;
  };
  if (!token) {
    return badRequest(res, "token is required");
  }

  const jwtSecret = process.env.JWT_SECRET || "supersecret";

  // 1. Verify the FieldSales token offline with the shared secret.
  let claims: FieldSalesClaims;
  try {
    claims = jwt.verify(token, jwtSecret) as FieldSalesClaims;
  } catch {
    return unauthorized(res, "Invalid or expired FieldSales session");
  }
  const fsUserId = claims.userId;
  if (!fsUserId) {
    return unauthorized(res, "FieldSales token missing user identity");
  }

  try {
    const userModule = req.scope.resolve<any>(Modules.USER);
    const authModule = req.scope.resolve<any>(Modules.AUTH);
    // Resolve the device module up front so a misconfigured backend fails the
    // same way /pos/auth/login does.
    req.scope.resolve<any>(MODULE_KEYS.POS_DEVICE);

    // Identity is derived from the trusted claim, never the body.
    const ssoEmail = `fs_${fsUserId}@sso.local`;
    const displayName = (typeof name === "string" && name.trim()) || ssoEmail;
    const role = mapRole(claims.role);

    // 2. Auto-register (idempotent) a stable device for this rep. registerDevice
    //    upserts on device_code, so re-entry reuses the same device row.
    const deviceCode =
      (typeof bodyDeviceCode === "string" && bodyDeviceCode.trim()) ||
      `fs-${fsUserId}`;
    const { registration_token } = await registerPosDevice(req.scope, {
      device_code: deviceCode,
      device_name: `RoutePilot SSO – ${displayName}`,
      registered_by: fsUserId,
    });

    // 3. Auto-provision the POS user keyed to the FieldSales identity.
    let [user] = await userModule.listUsers({ email: ssoEmail });
    if (!user) {
      const created = await userModule.createUsers({
        email: ssoEmail,
        first_name: displayName,
        last_name: "",
      });
      user = Array.isArray(created) ? created[0] : created;

      // Register an emailpass identity with an unusable random password so the
      // user record is consistent with seeded users (SSO never uses it).
      const reg = await authModule.register("emailpass", {
        url: "/pos/auth/sso",
        headers: {},
        query: {},
        body: {
          email: ssoEmail,
          password: crypto.randomBytes(24).toString("hex"),
        },
        protocol: "http",
      });
      if (reg?.success && reg.authIdentity) {
        await authModule
          .updateAuthIdentities([
            { id: reg.authIdentity.id, app_metadata: { user_id: user.id } },
          ])
          .catch(() => {});
      }
    }

    // Keep role + traceability metadata fresh on every SSO.
    await userModule.updateUsers({
      selector: { id: user.id },
      data: {
        metadata: {
          ...(user.metadata ?? {}),
          role,
          fs_user_id: fsUserId,
          fs_org_id: claims.organisationId ?? null,
          sso_provider: "routepilot",
        },
      },
    });

    const offlineDays = Number(process.env.POS_OFFLINE_SESSION_DAYS ?? 7);
    const accessToken = jwt.sign(
      { user_id: user.id, role, device_code: deviceCode },
      jwtSecret,
      { expiresIn: "12h" },
    );
    const refreshToken = jwt.sign(
      { user_id: user.id, type: "refresh" },
      jwtSecret,
      { expiresIn: "30d" },
    );

    return ok(res, {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 60 * 60 * 12,
      device_code: deviceCode,
      device_token: registration_token,
      user: {
        id: user.id,
        name: displayName,
        email: user.email,
        role,
        status: "active",
        offline_access_expires_at: new Date(
          Date.now() + offlineDays * 24 * 60 * 60 * 1000,
        ).toISOString(),
        updated_at: user.updated_at,
      },
      offline_pin_hash: (user.metadata as any)?.offline_pin_hash ?? null,
    });
  } catch (err) {
    return serverError(res, err);
  }
}
