import { Modules } from "@medusajs/framework/utils";
import crypto from "node:crypto";

/**
 * Seed POS users so login + manager PIN flows work end-to-end.
 *
 * Creates (or updates):
 *   - manager@pos.local  (role=manager, manager_pin=9999)
 *   - cashier@pos.local  (role=cashier, offline_pin=1234)
 *
 * Existing admin@pos.local is promoted to role=manager and given the same
 * manager PIN, so either manager account can approve sensitive actions.
 *
 * Password handling goes through Medusa's emailpass provider so the user can
 * authenticate via /pos/auth/login. The PIN hashes are stored on user.metadata
 * and never the plaintext.
 */
function hashPin(pin: string): string {
  const salt = crypto.randomBytes(8).toString("hex");
  const digest = crypto
    .createHash("sha256")
    .update(salt + pin)
    .digest("hex");
  return `sha256$${salt}$${digest}`;
}

interface SeedSpec {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role: "manager" | "cashier" | "admin";
  offline_pin?: string;
  manager_pin?: string;
}

const SPECS: SeedSpec[] = [
  {
    email: "manager@pos.local",
    password: "manager12345",
    first_name: "Maya",
    last_name: "Manager",
    role: "manager",
    offline_pin: "1111",
    manager_pin: "9999",
  },
  {
    email: "cashier@pos.local",
    password: "cashier12345",
    first_name: "Carla",
    last_name: "Cashier",
    role: "cashier",
    offline_pin: "1234",
  },
];

export default async function seedUsers({ container }: { container: any }) {
  const authModule = container.resolve(Modules.AUTH);
  const userModule = container.resolve(Modules.USER);

  for (const spec of SPECS) {
    // Skip if already present.
    const [existing] = await userModule.listUsers({ email: spec.email });
    let user = existing;

    if (!user) {
      // Create the user record.
      user = await userModule.createUsers({
        email: spec.email,
        first_name: spec.first_name,
        last_name: spec.last_name,
      });

      // Register the auth identity (emailpass) so login works.
      const reg = await authModule.register("emailpass", {
        url: "/seed",
        headers: {},
        query: {},
        body: { email: spec.email, password: spec.password },
        protocol: "http",
      });
      if (!reg?.success) {
        console.warn(`Auth register failed for ${spec.email}: ${reg?.error}`);
      } else {
        // Link the auth identity to the user.
        await authModule.updateAuthIdentities([
          {
            id: reg.authIdentity.id,
            app_metadata: { user_id: user.id },
          },
        ]);
      }
      console.log(`Created user ${spec.email}`);
    } else {
      console.log(`User ${spec.email} already exists — refreshing metadata`);
    }

    // Always (re)apply metadata so role + PIN stay correct.
    const metadata: Record<string, unknown> = {
      ...(user.metadata ?? {}),
      role: spec.role,
    };
    if (spec.offline_pin) {
      metadata.offline_pin_hash = hashPin(spec.offline_pin);
    }
    if (spec.manager_pin) {
      metadata.manager_pin_hash = hashPin(spec.manager_pin);
    }
    await userModule.updateUsers({
      selector: { id: user.id },
      data: { metadata },
    });
  }

  // Promote any pre-existing admin@pos.local to manager so they can also approve.
  const [admin] = await userModule.listUsers({ email: "admin@pos.local" });
  if (admin) {
    await userModule.updateUsers({
      selector: { id: admin.id },
      data: {
        metadata: {
          ...(admin.metadata ?? {}),
          role: "manager",
          manager_pin_hash: hashPin("9999"),
        },
      },
    });
    console.log("Promoted admin@pos.local to manager (PIN 9999)");
  }

  console.log("\nLogin credentials:");
  for (const s of SPECS) {
    const pins = [s.offline_pin && `offline=${s.offline_pin}`, s.manager_pin && `manager=${s.manager_pin}`]
      .filter(Boolean)
      .join(", ");
    console.log(`  ${s.email}  password=${s.password}  role=${s.role}  pins(${pins})`);
  }
}
