import { useEffect, useMemo, useState } from "react";

/**
 * Sales analytics, computed from the terminal's local order history (the POS's
 * source of truth — every offline + online sale is recorded locally). Shows
 * KPIs, a daily trend, payment mix, top products and an estimated gross profit,
 * with CSV export. Works fully offline.
 */
type Range = "today" | "7d" | "30d" | "all";

function rangeBounds(r: Range): { from?: string; to?: string } {
  if (r === "all") return {};
  const now = new Date();
  const to = now.toISOString();
  const start = new Date(now);
  if (r === "today") start.setHours(0, 0, 0, 0);
  else if (r === "7d") start.setDate(now.getDate() - 6);
  else if (r === "30d") start.setDate(now.getDate() - 29);
  if (r !== "today") start.setHours(0, 0, 0, 0);
  return { from: start.toISOString(), to };
}

function inr(n: number) {
  return `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<Range>("30d");
  const [orders, setOrders] = useState<any[]>([]);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [byStore, setByStore] = useState<any[]>([]);
  const [marginPct, setMarginPct] = useState(40);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await window.pos.analytics(rangeBounds(range));
      setOrders(res?.orders ?? []);
      setTopProducts(res?.top_products ?? []);
      setByStore(res?.by_store ?? []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  useEffect(() => {
    (async () => {
      setMarginPct(Number((await window.pos.getSetting("assumed_margin_pct")) ?? 40) || 40);
    })().catch(() => {});
  }, []);

  const kpis = useMemo(() => {
    let gross = 0, discount = 0, tax = 0, net = 0;
    for (const o of orders) {
      gross += Number(o.subtotal ?? 0);
      discount += Number(o.discount_total ?? 0);
      tax += Number(o.tax_total ?? 0);
      net += Number(o.grand_total ?? 0);
    }
    return { orders: orders.length, gross, discount, tax, net, profit: net * (marginPct / 100) };
  }, [orders, marginPct]);

  const daily = useMemo(() => {
    const m = new Map<string, { date: string; orders: number; net: number }>();
    for (const o of orders) {
      const date = (o.created_at ?? "").slice(0, 10) || "—";
      const row = m.get(date) ?? { date, orders: 0, net: 0 };
      row.orders += 1;
      row.net += Number(o.grand_total ?? 0);
      m.set(date, row);
    }
    return Array.from(m.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [orders]);

  const maxDaily = Math.max(1, ...daily.map((d) => d.net));

  const paymentMix = useMemo(() => {
    const m = new Map<string, { mode: string; count: number; amount: number }>();
    for (const o of orders) {
      const mode = o.payment_mode ?? "cash";
      const row = m.get(mode) ?? { mode, count: 0, amount: 0 };
      row.count += 1;
      row.amount += Number(o.grand_total ?? 0);
      m.set(mode, row);
    }
    return Array.from(m.values()).sort((a, b) => b.amount - a.amount);
  }, [orders]);

  function exportCsv() {
    const header = ["date", "orders", "net_sales_inr"];
    const lines = daily.map((d) => [d.date, d.orders, d.net.toFixed(2)].join(","));
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sales-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const Card = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Analytics</h1>
        <div className="row" style={{ gap: 6 }}>
          {(["today", "7d", "30d", "all"] as Range[]).map((r) => (
            <button key={r} className={range === r ? "primary" : "outline"} onClick={() => setRange(r)}>
              {r === "today" ? "Today" : r === "all" ? "All" : r === "7d" ? "7 days" : "30 days"}
            </button>
          ))}
          <button className="outline" onClick={exportCsv} disabled={daily.length === 0}>📥 CSV</button>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 4 }}>
        From this terminal's sales history{loading ? " · loading…" : ""}.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 8 }}>
        <Card label="Orders" value={String(kpis.orders)} />
        <Card label="Gross sales" value={inr(kpis.gross)} />
        <Card label="Net sales" value={inr(kpis.net)} sub={`after ${inr(kpis.discount)} discount`} />
        <Card label="Tax collected" value={inr(kpis.tax)} />
        <Card label="Discounts" value={inr(kpis.discount)} />
        <Card label={`Est. gross profit (${marginPct}%)`} value={inr(kpis.profit)} sub="estimate — set margin % in Settings" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginTop: 18 }}>
        <div className="panel elev">
          <strong>Daily net sales</strong>
          {daily.length === 0 ? (
            <div className="muted" style={{ marginTop: 8 }}>No sales in this period.</div>
          ) : (
            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              {daily.map((d) => (
                <div key={d.date} style={{ display: "grid", gridTemplateColumns: "90px 1fr 80px", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <span className="muted">{d.date.slice(5)}</span>
                  <div style={{ background: "var(--panel-2, #f1f1f1)", borderRadius: 4, height: 16 }}>
                    <div style={{ width: `${(d.net / maxDaily) * 100}%`, background: "var(--primary, #282828)", height: "100%", borderRadius: 4 }} />
                  </div>
                  <span style={{ textAlign: "right" }}>{inr(d.net)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel elev">
          <strong>Payment mix</strong>
          {paymentMix.length === 0 ? (
            <div className="muted" style={{ marginTop: 8 }}>—</div>
          ) : (
            <div style={{ marginTop: 10 }}>
              {paymentMix.map((p) => {
                const pct = kpis.net > 0 ? (p.amount / kpis.net) * 100 : 0;
                return (
                  <div key={p.mode} style={{ marginBottom: 8 }}>
                    <div className="row" style={{ justifyContent: "space-between", fontSize: 12 }}>
                      <span style={{ textTransform: "uppercase" }}>{p.mode}</span>
                      <span>{inr(p.amount)} · {pct.toFixed(0)}%</span>
                    </div>
                    <div style={{ background: "var(--panel-2, #f1f1f1)", borderRadius: 4, height: 6, marginTop: 2 }}>
                      <div style={{ width: `${pct}%`, background: "var(--primary, #282828)", height: "100%", borderRadius: 4 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="panel elev" style={{ marginTop: 16 }}>
        <strong>Sales by store</strong>
        {byStore.length === 0 ? (
          <div className="muted" style={{ marginTop: 8 }}>—</div>
        ) : (
          <table style={{ width: "100%", marginTop: 10, fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                <th>Store</th><th style={{ textAlign: "right" }}>Orders</th><th style={{ textAlign: "right" }}>Net sales</th>
              </tr>
            </thead>
            <tbody>
              {byStore.map((s) => (
                <tr key={s.store_id ?? s.store_name} style={{ borderTop: "1px solid var(--border)" }}>
                  <td>{s.store_name}</td>
                  <td style={{ textAlign: "right" }}>{s.orders}</td>
                  <td style={{ textAlign: "right" }}>{inr(s.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel elev" style={{ marginTop: 16 }}>
        <strong>Top products</strong>
        {topProducts.length === 0 ? (
          <div className="muted" style={{ marginTop: 8 }}>No product sales in this period.</div>
        ) : (
          <table style={{ width: "100%", marginTop: 10, fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                <th>Product</th><th>SKU</th><th style={{ textAlign: "right" }}>Qty sold</th><th style={{ textAlign: "right" }}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.map((p) => (
                <tr key={p.sku} style={{ borderTop: "1px solid var(--border)" }}>
                  <td>{p.product_name}</td>
                  <td>{p.sku}</td>
                  <td style={{ textAlign: "right" }}>{p.qty}</td>
                  <td style={{ textAlign: "right" }}>{inr(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
