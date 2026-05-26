import { useEffect, useState } from "react";

export default function SyncPage() {
  const [state, setState] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);

  async function refresh() {
    setState(await window.pos.syncState());
    setStats(await window.pos.queueStats());
  }

  useEffect(() => {
    refresh().catch(() => {});
    const handle = setInterval(refresh, 2000);
    return () => clearInterval(handle);
  }, []);

  return (
    <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div className="panel elev">
        <h2 style={{ marginTop: 0 }}>📡 Connection</h2>
        <div className="row" style={{ marginBottom: 12 }}>
          <span
            className={`badge ${state?.online ? "online" : "offline"}`}
            style={{ fontSize: 14, padding: "5px 14px" }}
          >
            <span className="dot" />
            {state?.online ? "Online" : "Offline"}
          </span>
          {state?.in_progress && <span className="badge info">Syncing…</span>}
          {state?.paused && <span className="badge offline">Paused</span>}
        </div>

        <div className="col" style={{ gap: 8 }}>
          <div className="stat">
            <div className="label">Last pull</div>
            <div className="value" style={{ fontSize: 14 }}>
              {state?.last_pull_at ?? "—"}
            </div>
          </div>
          <div className="stat">
            <div className="label">Last push</div>
            <div className="value" style={{ fontSize: 14 }}>
              {state?.last_push_at ?? "—"}
            </div>
          </div>
        </div>

        <div className="row" style={{ marginTop: 16 }}>
          <button className="primary flex-1" onClick={() => window.pos.syncTick()}>
            Sync now
          </button>
          <button className="ghost flex-1" onClick={() => window.pos.syncPause(!state?.paused)}>
            {state?.paused ? "Resume" : "Pause"}
          </button>
        </div>
      </div>

      <div className="panel elev">
        <h2 style={{ marginTop: 0 }}>📦 Queue</h2>
        <div className="muted" style={{ marginBottom: 12 }}>
          Counters of locally-queued events by sync status.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div className="stat warning">
            <div className="label">Pending</div>
            <div className="value">{stats?.pending ?? 0}</div>
          </div>
          <div className="stat info">
            <div className="label">Syncing</div>
            <div className="value">{stats?.syncing ?? 0}</div>
          </div>
          <div className="stat success">
            <div className="label">Synced</div>
            <div className="value">{stats?.synced ?? 0}</div>
          </div>
          <div className="stat danger">
            <div className="label">Failed</div>
            <div className="value">{stats?.failed ?? 0}</div>
          </div>
          <div className="stat danger" style={{ gridColumn: "1 / -1" }}>
            <div className="label">Conflict — needs admin review</div>
            <div className="value">{stats?.conflict ?? 0}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
