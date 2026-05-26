import { Module } from "@medusajs/framework/utils";
import { MODULE_KEYS } from "../index";
import AuditLogModuleService from "./service";

export default Module(MODULE_KEYS.AUDIT_LOG, {
  service: AuditLogModuleService,
});

export { AuditLogModuleService };
export const AUDIT_LOG_MODULE = MODULE_KEYS.AUDIT_LOG;
