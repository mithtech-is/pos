import { useState } from "react";

/**
 * Customers / CRM.
 *
 * Look a customer up by phone to see their loyalty balance, lifetime spend and
 * visit count (from the backend Customer module), plus their recent purchases
 * recorded on this terminal (local SQLite — works offline). Loyalty lookup
 * itself needs the backend online.
 */
export default function CustomersPage() {
  const [phone, setPhone] = useState("");
  const [customer, setCustomer] = useState<any | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function search() {
    const p = phone.trim();
    if (p.length < 6) {
      setMsg("Enter a full phone number.");
      return;
    }
    setBusy(true);
    setMsg(null);
    setCustomer(null);
    try {
      const res = await window.pos.lookupCustomer(p);
      if (res?.ok && res.data) {
        setCustomer(res.data);
      } else if (res?.error) {
        setMsg("Loyalty lookup failed — backend may be offline. Showing local purchases only.");
      } else {
        setMsg("No loyalty profile yet for that number (they'll get one on their next sale).");
      }
      const all = (await window.pos.listLocalOrders({})) as any[];
      setOrders((all ?? []).filter((o) => (o.parent_mobile ?? "") === p));
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 820, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 4px" }}>Customers</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Look up a customer by phone to see loyalty points, lifetime spend and recent purchases.
      </p>

      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <input
          autoFocus
          placeholder="Customer phone number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void search()}
          style={{ flex: 1 }}
        />
        <button className="primary" disabled={busy} onClick={() => void search()}>
          {busy ? "Searching…" : "Search"}
        </button>
      </div>

      {msg && (
        <div className="muted" style={{ marginTop: 10 }}>
          {msg}
        </div>
      )}

      {customer && (
        <div className="panel elev" style={{ marginTop: 16 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ margin: 0 }}>{customer.name || "Member"}</h2>
              <div className="muted">{customer.phone}</div>
            </div>
            <span className="badge online" style={{ fontSize: 16, padding: "8px 14px" }}>
              ⭐ {customer.loyalty_points} pts
            </span>
          </div>
          <div className="row" style={{ gap: 24, marginTop: 12 }}>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>Lifetime spend</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>₹{Number(customer.total_spent).toFixed(0)}</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12 }}>Visits</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{customer.visits}</div>
            </div>
            {customer.last_visit && (
              <div>
                <div className="muted" style={{ fontSize: 12 }}>Last visit</div>
                <div style={{ fontSize: 20, fontWeight: 600 }}>
                  {new Date(customer.last_visit).toLocaleDateString()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="panel elev" style={{ marginTop: 16 }}>
        <strong>Recent purchases (this terminal)</strong>
        {orders.length === 0 ? (
          <div className="muted" style={{ marginTop: 8 }}>No local purchases found for this number.</div>
        ) : (
          <table style={{ width: "100%", marginTop: 10, fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                <th>Order</th>
                <th>Date</th>
                <th>Payment</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th>Sync</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id ?? o.local_order_number} style={{ borderTop: "1px solid var(--border)" }}>
                  <td>{o.local_order_number}</td>
                  <td>{o.created_at ? new Date(o.created_at).toLocaleString() : "—"}</td>
                  <td>{o.payment_mode}</td>
                  <td style={{ textAlign: "right" }}>₹{Number(o.grand_total ?? 0).toFixed(2)}</td>
                  <td>{o.sync_status === "synced" ? "✓" : "⏳"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
