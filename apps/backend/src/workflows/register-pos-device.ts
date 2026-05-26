import { MODULE_KEYS } from "../modules";

interface RegisterPosDeviceInput {
  device_code: string;
  device_name: string;
  store_location_id?: string;
  sales_channel_id?: string;
  assigned_user_id?: string;
  registered_by: string;
}

export async function registerPosDevice(
  container: any,
  input: RegisterPosDeviceInput,
): Promise<{ device_id: string; registration_token: string }> {
  const devices = container.resolve(MODULE_KEYS.POS_DEVICE);
  const audit = container.resolve(MODULE_KEYS.AUDIT_LOG);

  const device = await devices.registerDevice({
    device_code: input.device_code,
    device_name: input.device_name,
    store_location_id: input.store_location_id,
    sales_channel_id: input.sales_channel_id,
    assigned_user_id: input.assigned_user_id,
  });
  const rec = Array.isArray(device) ? device[0] : device;
  await audit
    .log({
      user_id: input.registered_by,
      action: "device.registered",
      entity_type: "pos_device",
      entity_id: rec.id,
      new_value: { device_code: rec.device_code },
    })
    .catch(() => {});
  return { device_id: rec.id, registration_token: rec.registration_token };
}
