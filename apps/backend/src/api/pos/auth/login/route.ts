import type { MedusaRequest, MedusaResponse } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";
import jwt from "jsonwebtoken";
import { MODULE_KEYS } from "../../../../modules";
import { ok, badRequest, unauthorized, serverError } from "../../../_utils/response";

/**
 * POST /pos/auth/login
 *
 * Real authentication via Medusa's emailpass auth provider:
 *   1. validate device
 *   2. authenticate(emailpass, {email, password}) via Auth module
 *   3. look up the user record + read role/PIN from user.metadata
 *   4. issue a signed JWT the POS can use as access_token
 *
 * The POS persists the user in local SQLite so offline PIN unlock works after
 * a successful online login.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const { email, password, device_code } = (req.body ?? {}) as {
    email?: string;
    password?: string;
    device_code?: string;
  };
  if (!email || !password || !device_code) {
    return badRequest(res, "email, password and device_code are required");
  }

  try {
    const deviceService = req.scope.resolve<any>(MODULE_KEYS.POS_DEVICE);
    await deviceService.authorizeDevice(device_code);

    const authModule = req.scope.resolve<any>(Modules.AUTH);
    const userModule = req.scope.resolve<any>(Modules.USER);

    const authResult = await authModule.authenticate("emailpass", {
      url: "/pos/auth/login",
      headers: {},
      query: {},
      body: { email, password },
      protocol: "http",
    });

    if (!authResult || authResult.success !== true) {
      return unauthorized(res, authResult?.error ?? "Invalid credentials");
    }

    const [user] = await userModule.listUsers({ email });
    if (!user) {
      return unauthorized(
        res,
        "User authenticated but no profile record found",
      );
    }

    const role = (user.metadata as any)?.role ?? "cashier";
    const offlinePinHash = (user.metadata as any)?.offline_pin_hash;
    const offlineDays = Number(process.env.POS_OFFLINE_SESSION_DAYS ?? 7);

    const jwtSecret = process.env.JWT_SECRET || "supersecret";
    const accessToken = jwt.sign(
      { user_id: user.id, role, device_code },
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
      user: {
        id: user.id,
        name:
          [user.first_name, user.last_name].filter(Boolean).join(" ") ||
          user.email,
        email: user.email,
        role,
        status: "active",
        offline_access_expires_at: new Date(
          Date.now() + offlineDays * 24 * 60 * 60 * 1000,
        ).toISOString(),
        updated_at: user.updated_at,
      },
      offline_pin_hash: offlinePinHash,
    });
  } catch (err) {
    return serverError(res, err);
  }
}
