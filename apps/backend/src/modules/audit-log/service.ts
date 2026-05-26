import { MedusaService } from "@medusajs/framework/utils";
import { AuditLog } from "./models/audit-log";

class AuditLogModuleService extends MedusaService({ AuditLog }) {
  async log(args: {
    user_id?: string;
    device_id?: string;
    action: string;
    entity_type?: string;
    entity_id?: string;
    old_value?: Record<string, unknown>;
    new_value?: Record<string, unknown>;
    ip_address?: string;
    source?: "online" | "offline";
  }) {
    return this.createAuditLogs({
      ...args,
      source: args.source ?? "online",
    });
  }
}

export default AuditLogModuleService;
