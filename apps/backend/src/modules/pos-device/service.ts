import { MedusaService } from "@medusajs/framework/utils";
import crypto from "node:crypto";
import { POSDevice } from "./models/pos-device";
import { POSSession } from "./models/pos-session";

class PosDeviceModuleService extends MedusaService({
  POSDevice,
  POSSession,
}) {
  /**
   * Register a brand-new device or upsert a previously-registered one.
   * Marks status as `active` and mints a fresh registration token that
   * the POS must include on every sync push.
   */
  async registerDevice(args: {
    device_code: string;
    device_name: string;
    store_location_id?: string;
    sales_channel_id?: string;
    assigned_user_id?: string;
  }) {
    const token = crypto.randomBytes(32).toString("hex");
    const now = new Date();
    const [existing] = await this.listPOSDevices({
      device_code: args.device_code,
    });

    if (existing) {
      return this.updatePOSDevices({
        selector: { id: existing.id },
        data: {
          ...args,
          status: "active",
          registered_at: existing.registered_at ?? now,
          registration_token: token,
        },
      });
    }

    return this.createPOSDevices({
      ...args,
      status: "active",
      registered_at: now,
      registration_token: token,
    });
  }

  /**
   * Confirm a device is allowed to sync. Throws if the device is unknown,
   * blocked, or its registration token does not match.
   * The workflow layer (sync-offline-order-workflow) calls this first.
   */
  async authorizeDevice(deviceCode: string, token?: string) {
    const [device] = await this.listPOSDevices({ device_code: deviceCode });
    if (!device) {
      throw new Error(`Unknown POS device: ${deviceCode}`);
    }
    if (device.status === "blocked" || device.status === "retired") {
      throw new Error(`POS device ${deviceCode} is ${device.status}`);
    }
    if (token && device.registration_token && device.registration_token !== token) {
      throw new Error(`Invalid registration token for ${deviceCode}`);
    }
    return device;
  }

  async heartbeat(deviceCode: string) {
    const [device] = await this.listPOSDevices({ device_code: deviceCode });
    if (!device) return null;
    return this.updatePOSDevices({
      selector: { id: device.id },
      data: { last_sync_at: new Date() },
    });
  }

  async blockDevice(deviceId: string) {
    return this.updatePOSDevices({
      selector: { id: deviceId },
      data: { status: "blocked", blocked_at: new Date() },
    });
  }
}

export default PosDeviceModuleService;
