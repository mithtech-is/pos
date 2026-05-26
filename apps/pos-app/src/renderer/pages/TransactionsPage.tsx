import { useEffect, useMemo, useState } from "react";

/**
 * Live transactions screen.
 *
 * Pulls from the device's own local_orders (always live, works offline) and
 * groups by payment mode / cashier / school / hour. Cashier sees totals
 * update the instant a sale completes — no waiting for backend sync.
 *
 * "Include all counters" toggle merges in the backend's /pos/transactions
 * response so a manager can see other devices too. That call needs the
 * backend reachable; offline simply falls back to local-only.
 *
 * Important: this view answers "how much have WE sold and through which
 * channels", NOT "how much money has hit our bank account". UPI/Cash/Credit
 * reconciliation against the bank requires a payment gateway integration
 * (Razorpay / Cashfree / PayU), which the spec keeps out of MVP scope.
 */

type Mode = "cash" | "upi" | "credit" | "card";

interface LocalOrder {
  id: number;
  local_order_number: string;
  server_order_id: string | null;
  cashier_id: string;
  school_id: string;
  student_name?: string;
  parent_mobile?: string;
  grand_total: number;
  payment_mode: Mode;
  payment_reference?: string;
  sync_status: string;
  created_at: string;
}

const MODE_ICONS: Record<string, string> = {
  cash: "💵",
  upi: "📱",
  card: "💳",
  credit: "📒",
};

const MODE_COLORS: Record<string, string> = {
  cash: "var(--success)",
  upi: "var(--info)",
  card: "var(--accent)",
  credit: "var(--warning)",
};

function inr(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function hourLabel(iso: string) {
  // Convert "2026-05-19T09" → "9:00"
  const h = Number(iso.slice(11, 13));
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 || 12;
  return `${h12}${ampm}`;
}

type Range = "today" | "yesterday" | "7d" | "all";

function rangeBounds(w: Range): { since: Date; until: Date } {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  switch (w) {
    case "today":
      return { since: start, until: now };
    case "yesterday": {
      const y = new Date(start); y.setDate(y.getDate() - 1);
      const end = new Date(start);
      return { since: y, until: end };
    }
    case "7d": {
      const s = new Date(start); s.setDate(s.getDate() - 6);
      return { since: s, until: now };
    }
    case "all":
      return { since: new Date(0), until: now };
  }
}

export default function TransactionsPage() {
  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [schoolNames, setSchoolNames] = useState<Record<string, string>>({});
  const [range, setRange] = useState<Range>("today");
  const [updatedAt, setUpdatedAt] = useState<Date>(new Date());

  async function refresh() {
    const list: LocalOrder[] = await window.pos.listLocalOrders({ limit: 1000 });
    setOrders(list);
    const schools = await window.pos.listSchools();
    const map: Record<string, string> = {};
    for (const s of schools) map[s.id] = `${s.code} · ${s.name}`;
    setSchoolNames(map);
    setUpdatedAt(new Date());
  }

  useEffect(() => {
    refresh().catch(() => {});
    const handle = setInterval(refresh, 4000);
    return () => clearInterval(handle);
  }, []);

  const filtered = useMemo(() => {
    const { since, until } = rangeBounds(range);
    return orders.filter((o) => {
      const t = new Date(o.created_at);
      return t >= since && t <= until;
    });
  }, [orders, range]);

  const totalGross = filtered.reduce((s, o) => s + Number(o.grand_total ?? 0), 0);

  const byMode = useMemo(() => {
    const m = new Map<string, { mode: string; count: number; gross: number; refs: number }>();
    for (const o of filtered) {
      const k = o.payment_mode;
      const cur = m.get(k) ?? { mode: k, count: 0, gross: 0, refs: 0 };
      cur.count++;
      cur.gross += Number(o.grand_total ?? 0);
      if (o.payment_reference) cur.refs++;
      m.set(k, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.gross - a.gross);
  }, [filtered]);

  const bySchool = useMemo(() => {
    const m = new Map<string, { school_id: string; count: number; gross: number }>();
    for (const o of filtered) {
      const cur = m.get(o.school_id) ?? { school_id: o.school_id, count: 0, gross: 0 };
      cur.count++;
      cur.gross += Number(o.grand_total ?? 0);
      m.set(o.school_id, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.gross - a.gross);
  }, [filtered]);

  const byCashier = useMemo(() => {
    const m = new Map<string, { cashier_id: string; count: number; gross: number }>();
    for (const o of filtered) {
      const cur = m.get(o.cashier_id) ?? { cashier_id: o.cashier_id, count: 0, gross: 0 };
      cur.count++;
      cur.gross += Number(o.grand_total ?? 0);
      m.set(o.cashier_id, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.gross - a.gross);
  }, [filtered]);

  const byHour = useMemo(() => {
    const m = new Map<string, { hour: string; count: number; gross: number }>();
    for (const o of filtered) {
      const hourKey = o.created_at.slice(0, 13);
      const cur = m.get(hourKey) ?? { hour: hourKey, count: 0, gross: 0 };
      cur.count++;
      cur.gross += Number(o.grand_total ?? 0);
      m.set(hourKey, cur);
    }
    return Array.from(m.values()).sort((a, b) => a.hour.localeCompare(b.hour));
  }, [filtered]);

  const recent = filtered.slice(0, 12);
  const peakHour = byHour.length > 0
    ? byHour.reduce((peak, h) => (h.gross > peak.gross ? h : peak), byHour[0])
    : null;
  const maxHourGross = byHour.reduce((m, h) => Math.max(m, h.gross), 0);

  const pendingSync = orders.filter((o) => o.sync_status !== "synced").length;

  return (
    <div style={{ padding: 16 }}>
      <div className="row" style={{ marginBottom: 16, justifyContent: "space-between" }}>
        <div>
          <h2 style={{ marginBottom: 0 }}>💹 Transactions</h2>
          <div className="muted">
            Live · last refreshed {updatedAt.toLocaleTimeString()} · auto every 4s
          </div>
        </div>
        <div className="row">
          {(["today", "yesterday", "7d", "all"] as Range[]).map((w) => (
            <button
              key={w}
              className={range === w ? "primary" : "ghost"}
              onClick={() => setRange(w)}
            >
              {w === "today" ? "Today" : w === "yesterday" ? "Yesterday" : w === "7d" ? "Last 7 days" : "All time"}
            </button>
          ))}
        </div>
      </div>

      {/* Headline stats */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div className="panel elev">
          <div className="muted" style={{ textTransform: "uppercase", fontSize: 11, letterSpacing: "0.04em" }}>
            Gross collected
          </div>
          <div style={{ fontSize: 38, fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
            {inr(totalGross)}
          </div>
          <div className="muted">
            {filtered.length} order{filtered.length !== 1 ? "s" : ""}{" "}
            {pendingSync > 0 && (
              <>
                · <span style={{ color: "var(--warning)" }}>{pendingSync} pending sync</span>
              </>
            )}
          </div>
        </div>
        {byMode.slice(0, 3).map((m) => (
          <div key={m.mode} className="stat">
            <div className="label" style={{ color: MODE_COLORS[m.mode] ?? "var(--muted)" }}>
              {MODE_ICONS[m.mode] ?? "💰"} {m.mode}
            </div>
            <div className="value">{inr(m.gross)}</div>
            <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
              {m.count} order{m.count !== 1 ? "s" : ""}
              {m.mode === "upi" && (
                <> · {m.refs} with UTR</>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        {/* Hourly bar chart */}
        <div className="panel elev">
          <strong>⏱ By hour</strong>
          <div className="muted" style={{ marginBottom: 12 }}>
            {peakHour ? `Peak ${hourLabel(peakHour.hour)} · ${inr(peakHour.gross)}` : "No sales yet"}
          </div>
          {byHour.length === 0 ? (
            <div className="muted" style={{ padding: "40px 0", textAlign: "center" }}>
              No data for this window.
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 160, paddingBottom: 24, position: "relative" }}>
              {byHour.map((h) => {
                const pct = maxHourGross > 0 ? (h.gross / maxHourGross) * 100 : 0;
                return (
                  <div
                    key={h.hour}
                    style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}
                    title={`${hourLabel(h.hour)} — ${h.count} orders · ${inr(h.gross)}`}
                  >
                    <div
                      style={{
                        height: `${pct}%`,
                        minHeight: 4,
                        width: "100%",
                        background: "linear-gradient(180deg, var(--accent-hover) 0%, var(--accent) 100%)",
                        borderRadius: "4px 4px 0 0",
                        transition: "height 200ms",
                      }}
                    />
                    <div className="muted" style={{ fontSize: 10, marginTop: 4 }}>
                      {hourLabel(h.hour)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Payment mode breakdown */}
        <div className="panel elev">
          <strong>By payment mode</strong>
          <div className="muted" style={{ marginBottom: 12 }}>
            Where the money came in via.
          </div>
          {byMode.length === 0 ? (
            <div className="muted">—</div>
          ) : (
            byMode.map((m) => {
              const pct = totalGross > 0 ? (m.gross / totalGross) * 100 : 0;
              return (
                <div key={m.mode} style={{ marginBottom: 10 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span>
                      {MODE_ICONS[m.mode] ?? "💰"}{" "}
                      <strong style={{ textTransform: "capitalize" }}>{m.mode}</strong>{" "}
                      <span className="muted">· {m.count}</span>
                    </span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      {inr(m.gross)}{" "}
                      <span className="muted" style={{ fontSize: 11 }}>{pct.toFixed(0)}%</span>
                    </span>
                  </div>
                  <div style={{ height: 6, background: "var(--bg-elev-1)", borderRadius: 3, marginTop: 4 }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: MODE_COLORS[m.mode] ?? "var(--accent)",
                        borderRadius: 3,
                        transition: "width 200ms",
                      }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        {/* By school */}
        <div className="panel elev">
          <strong>🏫 By school</strong>
          <table style={{ marginTop: 10 }}>
            <thead>
              <tr>
                <th>School</th>
                <th className="right">Orders</th>
                <th className="right">Gross</th>
              </tr>
            </thead>
            <tbody>
              {bySchool.map((s) => (
                <tr key={s.school_id}>
                  <td>{schoolNames[s.school_id] ?? s.school_id.slice(-8)}</td>
                  <td className="right">{s.count}</td>
                  <td className="right">{inr(s.gross)}</td>
                </tr>
              ))}
              {bySchool.length === 0 && (
                <tr><td colSpan={3} className="muted">No data.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* By cashier */}
        <div className="panel elev">
          <strong>👤 By cashier</strong>
          <table style={{ marginTop: 10 }}>
            <thead>
              <tr>
                <th>Cashier</th>
                <th className="right">Orders</th>
                <th className="right">Gross</th>
              </tr>
            </thead>
            <tbody>
              {byCashier.map((c) => (
                <tr key={c.cashier_id}>
                  <td>{c.cashier_id.slice(-12)}</td>
                  <td className="right">{c.count}</td>
                  <td className="right">{inr(c.gross)}</td>
                </tr>
              ))}
              {byCashier.length === 0 && (
                <tr><td colSpan={3} className="muted">No data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent feed */}
      <div className="panel elev" style={{ marginTop: 12 }}>
        <strong>🕒 Recent transactions</strong>
        <table style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>Time</th>
              <th>Local #</th>
              <th>Student / Mobile</th>
              <th>School</th>
              <th>Mode</th>
              <th>Reference (UTR)</th>
              <th className="right">Amount</th>
              <th>Sync</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((o) => (
              <tr key={o.id}>
                <td>{new Date(o.created_at).toLocaleTimeString()}</td>
                <td style={{ fontFamily: "var(--font-mono)" }}>{o.local_order_number}</td>
                <td>
                  {o.student_name ?? <span className="muted">—</span>}
                  <div className="muted" style={{ fontSize: 11 }}>{o.parent_mobile ?? ""}</div>
                </td>
                <td>{schoolNames[o.school_id]?.split(" · ")[0] ?? "—"}</td>
                <td>
                  <span style={{ color: MODE_COLORS[o.payment_mode] ?? "var(--muted)" }}>
                    {MODE_ICONS[o.payment_mode] ?? "💰"} {o.payment_mode}
                  </span>
                </td>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                  {o.payment_reference ?? <span className="muted">—</span>}
                </td>
                <td className="right" style={{ fontWeight: 600 }}>{inr(o.grand_total)}</td>
                <td>
                  <span className={`badge ${o.sync_status === "synced" ? "online" : "offline"}`}>
                    {o.sync_status}
                  </span>
                </td>
              </tr>
            ))}
            {recent.length === 0 && (
              <tr><td colSpan={8} className="muted" style={{ textAlign: "center", padding: 24 }}>
                No transactions in this window.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ marginTop: 12, fontSize: 12 }}>
        <strong style={{ color: "var(--muted-2)" }}>Note on UPI reconciliation:</strong>{" "}
        <span className="muted">
          These totals reflect every sale this POS has rung up. Money landing
          in your bank account is verified separately — for automated bank-side
          reconciliation you need a payment gateway (Razorpay / Cashfree /
          Paytm) which can be added without changing this view.
        </span>
      </div>
    </div>
  );
}

