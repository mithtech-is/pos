import { Module } from "@medusajs/framework/utils";
import { MODULE_KEYS } from "../index";
import PosDeviceModuleService from "./service";

export default Module(MODULE_KEYS.POS_DEVICE, {
  service: PosDeviceModuleService,
});

export { PosDeviceModuleService };
export const POS_DEVICE_MODULE = MODULE_KEYS.POS_DEVICE;
