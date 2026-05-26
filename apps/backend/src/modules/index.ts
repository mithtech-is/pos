/**
 * Aliases used to resolve custom modules from the container.
 *
 *   const schoolService = req.scope.resolve(MODULE_KEYS.SCHOOL)
 *
 * Each module's `index.ts` registers itself under one of these keys.
 */
export const MODULE_KEYS = {
  SCHOOL: "schoolModuleService",
  UNIFORM_KIT: "uniformKitModuleService",
  POS_DEVICE: "posDeviceModuleService",
  OFFLINE_SYNC: "offlineSyncModuleService",
  AUDIT_LOG: "auditLogModuleService",
  STUDENT: "studentModuleService",
  RECEIPT: "receiptModuleService",
} as const;

export type ModuleKey = (typeof MODULE_KEYS)[keyof typeof MODULE_KEYS];
