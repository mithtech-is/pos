import { useEffect, useState } from "react";

/**
 * Conflict viewer. Reads conflicts from the backend so the cashier can see
 * what the admin needs to resolve. Local-only conflict state lives in the
 * sync queue (status = conflict) — surfaced as well.
 */
export default function ConflictsPage() {
  const [backendUrl, setBackendUrl] = useState<string>("");
  const [serverConflicts, setServerConflicts] = useState<any[]>([]);
  const [localConflicts, setLocalConflicts] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const url = (await window.pos.getSetting("backend_url")) as string | null;
      setBackendUrl(url ?? "");
      try {
        if (url) {
          const res = await fetch(`${url}/admin/sync-conflicts`);
          if (res.ok) {
            const payload = await res.json();
            setServerConflicts(payload.data?.items ?? []);
          }
        }
      } catch (err) {
        setError(`Failed to load server conflicts: ${(err as Error).message}`);
      }
      const stats = await window.pos.queueStats();
      // Local queue rows in "conflict" state are visible via listLocalOrders + queueStats
      setLocalConflicts(Object.entries(stats).filter(([k, v]) => k === "conflict" && (v as number) > 0));
    })();
  }, []);

  return (
    <div className="panel" style={{ margin: 12 }}>
      <h2 style={{ marginTop: 0 }}>Sync conflicts</h2>
      <div className="muted">Backend: {backendUrl || "not configured"}</div>
      {error && <div style={{ color: "var(--danger)", marginTop: 8 }}>{error}</div>}

      <h3>Local queue</h3>
      {localConflicts.length === 0 ? (
        <div className="muted">No local conflicts.</div>
      ) : (
        <div>{localConflicts.length} conflicting event(s) — see Pending tab.</div>
      )}

      <h3>Server conflicts</h3>
      {serverConflicts.length === 0 ? (
        <div className="muted">None reported.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Severity</th>
              <th>Device</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {serverConflicts.map((c) => (
              <tr key={c.id}>
                <td>{c.conflict_type}</td>
                <td>{c.severity}</td>
                <td>{c.device_id}</td>
                <td>{c.resolution_status}</td>
                <td>{c.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="muted" style={{ marginTop: 8 }}>
        Resolution actions happen in the Medusa admin dashboard.
      </div>
    </div>
  );
}
