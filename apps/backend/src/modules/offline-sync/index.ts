import { Module } from "@medusajs/framework/utils";
import { MODULE_KEYS } from "../index";
import OfflineSyncModuleService from "./service";

export default Module(MODULE_KEYS.OFFLINE_SYNC, {
  service: OfflineSyncModuleService,
});

export { OfflineSyncModuleService };
export const OFFLINE_SYNC_MODULE = MODULE_KEYS.OFFLINE_SYNC;
