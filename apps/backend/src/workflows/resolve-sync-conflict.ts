import { MODULE_KEYS } from "../modules";

interface ResolveSyncConflictInput {
  conflict_id: string;
  resolution: "approve" | "reject" | "transfer_stock" | "adjust_stock";
  resolved_by: string;
  note?: string;
  payload?: Record<string, unknown>;
}

export async function resolveSyncConflict(
  container: any,
  input: ResolveSyncConflictInput,
): Promise<{ ok: true }> {
  const sync = container.resolve(MODULE_KEYS.OFFLINE_SYNC);
  const audit = container.resolve(MODULE_KEYS.AUDIT_LOG);

  const conflict = await sync.retrieveSyncConflict(input.conflict_id);

  switch (input.resolution) {
    case "approve":
      await sync.updateSyncEvents({
        selector: { id: conflict.event_id },
        data: { status: "pending" },
      });
      break;
    case "reject":
      await sync.rejectConflict(input.conflict_id, input.resolved_by, input.note);
      break;
    case "transfer_stock":
    case "adjust_stock":
      // For MVP we record the intent in audit_logs; ops carry out the
      // physical movement via the admin inventory screens.
      await audit.log({
        user_id: input.resolved_by,
        action: `conflict.${input.resolution}`,
        entity_type: "sync_conflict",
        entity_id: input.conflict_id,
        new_value: input.payload,
      });
      break;
  }

  await sync.resolveConflict(input.conflict_id, input.resolved_by, input.note);
  return { ok: true };
}
