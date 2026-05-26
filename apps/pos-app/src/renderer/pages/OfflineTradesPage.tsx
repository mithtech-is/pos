import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Offline Trades — the compliance officer's audit view.
 *
 * Lists every trade that was booked while the terminal was offline. Source:
 * `local_orders` rows where `created_offline = 1`. The pill on each row
 * shows the current sync state (synced / pending / failed / conflict) so
 * compliance can see at a glance which trades are still awaiting upload
 * and which have already been reconciled with the central book.
 *
 * Why this matters for an unlisted-shares dealer:
 *   • SEBI requires every off-exchange trade to be on a contract note.
 *   • Compliance has to be able to prove which trades happened during
 *     internet outages and that none were lost.
 *   • Exporting to CSV makes it trivial to ship the day's offline ledger
 *     to the auditor.
 */

interface TradeRow {
  id: number;
  local_order_number: string;
  server_order_id: string | null;
  student_name: string | null;
  parent_mobile: string | null;
  grand_total: number;
  payment_mode: string;
  payment_reference: string | null;
  sync_status: "synced" | "pending" | "failed" | "conflict";
  created_at: string | null;
  created_offline: number | boolean;
}

type Filter = "all" | "pending" | "synced" | "failed" | "conflict";

function inr(n: number): string {
  return `₹${Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

export default function OfflineTradesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<TradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  async function load() {
    setLoading(true);
    try {
      const all = (await window.pos.listLocalOrders({})) as TradeRow[];
      const offlineOnly = (all ?? []).filter(
        (o) => o.created_offline === 1 || o.created_offline === true,
      );
      setRows(offlineOnly);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.sync_status !== filter) return false;
      if (!q) return true;
      const hay = [
        r.local_order_number,
        r.server_order_id,
        r.student_name,
        r.parent_mobile,
        r.payment_reference,
        String(r.grand_total ?? ""),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, filter]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const value = filtered.reduce(
      (sum, r) => sum + Number(r.grand_total ?? 0),
      0,
    );
    const pending = filtered.filter((r) => r.sync_status !== "synced").length;
    return { total, value, pending };
  }, [filtered]);

  function exportCsv() {
    const header = [
      "local_trade_id",
      "server_id",
      "client_name",
      "client_mobile",
      "amount_inr",
      "settlement_mode",
      "settlement_ref",
      "sync_status",
      "created_at",
    ];
    const lines = filtered.map((r) =>
      [
        r.local_order_number,
        r.server_order_id ?? "",
        r.student_name ?? "",
        r.parent_mobile ?? "",
        Number(r.grand_total ?? 0).toFixed(2),
        r.payment_mode,
        r.payment_reference ?? "",
        r.sync_status,
        r.created_at ?? "",
      ]
        .map(escapeCsv)
        .join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `offline-trades-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function pushNow() {
    await window.pos.syncTick();
    await load();
  }

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 32, marginBottom: 4 }}>Offline Trades</h2>
        <div className="muted">
          Every trade booked while this terminal was offline. Use this view to
          confirm everything has settled with the central book before
          end-of-day reconciliation.
        </div>
      </div>

      {/* ── Summary stat cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 18 }}>
        <div className="stat">
          <div className="label">Total offline trades</div>
          <div className="value">{stats.total}</div>
        </div>
        <div className="stat info">
          <div className="label">Cumulative value</div>
          <div className="value">{inr(stats.value)}</div>
        </div>
        <div className="stat warning">
          <div className="label">Awaiting sync</div>
          <div className="value">{stats.pending}</div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="row" style={{ marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by trade #, client, mobile, ref…"
          style={{ maxWidth: 420 }}
        />
        <FilterPill label="All" active={filter === "all"} onClick={() => setFilter("all")} />
        <FilterPill label="Pending sync" active={filter === "pending"} onClick={() => setFilter("pending")} />
        <FilterPill label="Synced" active={filter === "synced"} onClick={() => setFilter("synced")} />
        <FilterPill label="Failed" active={filter === "failed"} onClick={() => setFilter("failed")} />
        <FilterPill label="Conflict" active={filter === "conflict"} onClick={() => setFilter("conflict")} />
        <span className="spacer" />
        <button className="outline" onClick={() => void load()}>
          Refresh
        </button>
        <button className="outline" onClick={() => void pushNow()}>
          🔄 Push to backend
        </button>
        <button className="primary" onClick={exportCsv} disabled={filtered.length === 0}>
          📥 Export CSV
        </button>
      </div>

      {/* ── Trade table ── */}
      <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div className="muted" style={{ padding: 24, textAlign: "center" }}>
            Loading offline trades…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: "var(--muted)" }}>
            <div style={{ fontSize: 48, marginBottom: 8, opacity: 0.5 }}>✓</div>
            {query || filter !== "all"
              ? "No offline trades match the current filter."
              : "No offline trades on this terminal. Every trade so far was booked while online."}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Local trade #</th>
                <th>Client</th>
                <th className="right">Amount</th>
                <th>Settlement</th>
                <th>Status</th>
                <th>Booked at</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => navigate(`/orders?focus=${r.id}`)}
                  title="Open in Trades"
                >
                  <td>
                    <span className="kbd">{r.local_order_number}</span>
                    {r.server_order_id && (
                      <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                        ↳ {r.server_order_id}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.student_name ?? "—"}</div>
                    <div className="muted">{r.parent_mobile ?? ""}</div>
                  </td>
                  <td className="right" style={{ fontWeight: 700 }}>
                    {inr(Number(r.grand_total ?? 0))}
                  </td>
                  <td>
                    <span style={{ textTransform: "uppercase", fontSize: 11, letterSpacing: "0.06em", fontWeight: 600 }}>
                      {prettyPaymentMode(r.payment_mode)}
                    </span>
                    {r.payment_reference && (
                      <div className="muted" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                        {r.payment_reference}
                      </div>
                    )}
                  </td>
                  <td>
                    <SyncPill status={r.sync_status} />
                  </td>
                  <td className="muted">
                    {(r.created_at ?? "").replace("T", " ").slice(0, 19)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={active ? "primary" : "outline"} onClick={onClick}>
      {label}
    </button>
  );
}

function SyncPill({ status }: { status: TradeRow["sync_status"] }) {
  switch (status) {
    case "synced":
      return <span className="badge success">✓ Synced</span>;
    case "pending":
      return <span className="badge warning">⏳ Pending sync</span>;
    case "failed":
      return <span className="badge danger">⚠ Failed</span>;
    case "conflict":
      return <span className="badge danger">⚡ Conflict</span>;
    default:
      return <span className="badge">{status}</span>;
  }
}

function prettyPaymentMode(m: string): string {
  switch (m) {
    case "cash":
      return "Cash";
    case "upi":
      return "UPI";
    case "credit":
      return "Credit / NEFT";
    default:
      return m;
  }
}

function escapeCsv(value: string): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
