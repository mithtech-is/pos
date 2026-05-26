import { useEffect, useState } from "react";

export default function PendingOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);

  async function refresh() {
    const all = await window.pos.listLocalOrders({ limit: 200 });
    setOrders(
      all.filter((o: any) => o.sync_status === "pending" || o.sync_status === "failed"),
    );
  }

  useEffect(() => {
    refresh().catch(() => {});
    const handle = setInterval(refresh, 4000);
    return () => clearInterval(handle);
  }, []);

  async function retry() {
    await window.pos.syncTick();
    await refresh();
  }

  return (
    <div className="panel" style={{ margin: 12 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Pending orders</h2>
        <button className="primary" onClick={retry}>Sync now</button>
      </div>
      {orders.length === 0 ? (
        <div className="muted" style={{ marginTop: 12 }}>Nothing pending. Everything is synced.</div>
      ) : (
        <table style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Local #</th>
              <th>School</th>
              <th>Total</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.local_order_number}</td>
                <td>{o.school_id}</td>
                <td>₹{Number(o.grand_total ?? 0).toFixed(2)}</td>
                <td>
                  <span className={`badge ${o.sync_status === "failed" ? "error" : "offline"}`}>
                    {o.sync_status}
                  </span>
                </td>
                <td>{o.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
