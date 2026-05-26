import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCartStore } from "../state/cart";

export default function OrdersPage() {
  const navigate = useNavigate();
  const cart = useCartStore();
  const [orders, setOrders] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [filtered, setFiltered] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const list = await window.pos.listLocalOrders({ limit: 200 });
      setOrders(list);
      setFiltered(list);
    })().catch(() => {});
  }, []);

  function applyFilter(q: string) {
    setQuery(q);
    const term = q.trim().toLowerCase();
    if (!term) {
      setFiltered(orders);
      return;
    }
    setFiltered(
      orders.filter(
        (o) =>
          o.local_order_number?.toLowerCase().includes(term) ||
          o.server_order_id?.toLowerCase().includes(term) ||
          o.parent_mobile?.toLowerCase().includes(term) ||
          o.student_name?.toLowerCase().includes(term),
      ),
    );
  }

  async function reprint(orderId: number) {
    const order = await window.pos.getLocalOrder(orderId);
    if (!order) return;
    const distributorName =
      ((await window.pos.getSetting("distributor_name")) as string) ?? "ABC Uniforms";
    await window.pos.printReceipt({
      distributor_name: distributorName,
      receipt_number: `R-${order.local_order_number}`,
      local_order_number: order.local_order_number,
      server_order_number: order.server_order_id ?? null,
      date_time: order.created_at,
      cashier_name: order.cashier_id,
      school_name: order.school_id,
      student_name: order.student_name,
      parent_mobile: order.parent_mobile,
      items: order.items ?? [],
      subtotal: order.subtotal,
      discount_total: order.discount_total,
      tax_total: order.tax_total,
      grand_total: order.grand_total,
      payment_mode: order.payment_mode,
      payment_reference: order.payment_reference,
      sync_status: order.sync_status === "synced" ? "synced" : "offline_pending",
    });
  }

  /**
   * Clone a past order into the current cart so the cashier can sell the same
   * items again. School/class/student info is preserved; cashier can still edit
   * sizes (the spec's most common use case: parent comes back for size 30 of
   * the shirt they bought in size 28).
   */
  async function reorder(orderId: number) {
    const order = await window.pos.getLocalOrder(orderId);
    if (!order) return;
    cart.reset();
    cart.setSchool(order.school_id);
    if (order.class_id) cart.setClass(order.class_id);
    cart.setStudent(order.student_name ?? "", order.parent_mobile ?? "");
    for (const item of order.items ?? []) {
      cart.addLine({
        variant_id: item.variant_id,
        sku: item.sku,
        product_name: item.product_name,
        size: item.size ?? "",
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: 0,
        tax_rate: 0,
      });
    }
    navigate("/pos");
  }

  return (
    <div className="panel" style={{ margin: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Trades</h2>
        <input
          placeholder="Filter by trade # / mobile / client name"
          value={query}
          onChange={(e) => applyFilter(e.target.value)}
          style={{ maxWidth: 320 }}
        />
      </div>
      <table style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Local #</th>
            <th>Student / Mobile</th>
            <th>School</th>
            <th>Total</th>
            <th>Sync</th>
            <th>Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((o) => (
            <tr key={o.id}>
              <td>
                {o.local_order_number}
                {o.server_order_id && (
                  <div className="muted" style={{ fontSize: 11 }}>{o.server_order_id}</div>
                )}
              </td>
              <td>
                {o.student_name ?? <span className="muted">—</span>}
                <div className="muted" style={{ fontSize: 11 }}>{o.parent_mobile ?? ""}</div>
              </td>
              <td>{o.school_id}</td>
              <td>₹{Number(o.grand_total ?? 0).toFixed(2)}</td>
              <td>
                <span className={`badge ${o.sync_status === "synced" ? "online" : "offline"}`}>
                  {o.sync_status}
                </span>
              </td>
              <td>{(o.created_at ?? "").slice(0, 16).replace("T", " ")}</td>
              <td>
                <div className="row">
                  <button onClick={() => reprint(o.id)}>Reprint</button>
                  <button className="primary" onClick={() => reorder(o.id)}>
                    Re-order
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
