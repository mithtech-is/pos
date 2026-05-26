import { useEffect, useState } from "react";

interface SyncState {
  online: boolean;
  last_pull_at: string | null;
  last_push_at: string | null;
  in_progress: boolean;
  paused: boolean;
}

export default function SyncStatusBadge() {
  const [state, setState] = useState<SyncState | null>(null);
  const [stats, setStats] = useState<{ pending: number; failed: number; conflict: number } | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const [s, qs] = await Promise.all([
          window.pos.syncState(),
          window.pos.queueStats(),
        ]);
        if (!alive) return;
        setState(s);
        setStats({ pending: qs.pending, failed: qs.failed, conflict: qs.conflict });
      } catch {
        /* preload not yet bound */
      }
    };
    tick();
    const handle = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(handle);
    };
  }, []);

  if (!state) {
    return <span className="badge">Sync —</span>;
  }
  const cls = state.online ? "online" : stats?.conflict ? "error" : "offline";
  const label = state.online
    ? state.in_progress
      ? "Syncing…"
      : "Online"
    : "Offline";
  const counters: string[] = [];
  if (stats?.pending) counters.push(`${stats.pending} pending`);
  if (stats?.failed) counters.push(`${stats.failed} failed`);
  if (stats?.conflict) counters.push(`${stats.conflict} conflict`);

  return (
    <span
      className={`badge ${cls}`}
      title={`Last pull: ${state.last_pull_at ?? "never"} • Last push: ${state.last_push_at ?? "never"}`}
    >
      <span className="dot" />
      {label}
      {counters.length > 0 ? ` · ${counters.join(", ")}` : ""}
    </span>
  );
}
