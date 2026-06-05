import { useEffect, useState } from "react";

/**
 * Inventory / purchasing back-office:
 *  - Stock: stock-on-hand vs reorder point, with low-stock alerts.
 *  - Suppliers: vendor list.
 *  - Purchase Orders: order stock from a supplier, then "Receive" (goods
 *    receipt) to add it to stock-on-hand.
 *
 * Online-only (it's back-office). Distinct from the POS offline sell-side stock,
 * so it never affects checkout.
 */
type Tab = "stock" | "suppliers" | "po";

export default function InventoryPage() {
  const [tab, setTab] = useState<Tab>("stock");
  const [inventory, setInventory] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [edits, setEdits] = useState<Record<string, { stock: string; reorder: string }>>({});
  const [msg, setMsg] = useState<string | null>(null);

  // supplier form
  const [supName, setSupName] = useState("");
  const [supPhone, setSupPhone] = useState("");

  // PO form
  const [poSupplier, setPoSupplier] = useState("");
  const [poLines, setPoLines] = useState<Array<{ sku: string; qty: string; cost: string }>>([
    { sku: "", qty: "", cost: "" },
  ]);

  async function loadAll() {
    const inv = await window.pos.listInventory();
    if (inv?.ok && Array.isArray(inv.data)) {
      setInventory(inv.data);
      const e: Record<string, { stock: string; reorder: string }> = {};
      for (const i of inv.data) e[i.sku] = { stock: String(i.stock_on_hand), reorder: String(i.reorder_point) };
      setEdits(e);
    }
    const sup = await window.pos.listSuppliers();
    if (sup?.ok && Array.isArray(sup.data)) setSuppliers(sup.data);
    const po = await window.pos.listPurchaseOrders();
    if (po?.ok && Array.isArray(po.data)) setOrders(po.data);
  }
  useEffect(() => {
    void loadAll().catch(() => setMsg("Could not load — backend may be offline."));
  }, []);

  const lowCount = inventory.filter((i) => i.low_stock).length;

  async function saveRow(sku: string) {
    const e = edits[sku];
    if (!e) return;
    const res = await window.pos.updateInventory({
      sku,
      set_stock: Math.max(0, Number(e.stock) || 0),
      reorder_point: Math.max(0, Number(e.reorder) || 0),
    });
    if (res?.ok) await loadAll();
    else setMsg(res?.error ?? "Update failed (offline?)");
  }

  async function addSupplier() {
    if (!supName.trim()) return;
    const res = await window.pos.saveSupplier({ name: supName.trim(), phone: supPhone.trim() });
    if (res?.ok && Array.isArray(res.data)) {
      setSuppliers(res.data);
      setSupName("");
      setSupPhone("");
    } else setMsg(res?.error ?? "Could not add supplier (offline?)");
  }

  async function removeSupplier(id: string) {
    const res = await window.pos.deleteSupplier(id);
    if (res?.ok && Array.isArray(res.data)) setSuppliers(res.data);
  }

  async function createPO() {
    const lines = poLines
      .filter((l) => l.sku && Number(l.qty) > 0)
      .map((l) => ({ sku: l.sku, qty: Math.max(1, Number(l.qty) || 0), cost: Math.max(0, Number(l.cost) || 0) }));
    if (lines.length === 0) {
      setMsg("Add at least one line with a SKU and quantity.");
      return;
    }
    const sup = suppliers.find((s) => s.id === poSupplier);
    const res = await window.pos.savePurchaseOrder({
      supplier_id: poSupplier || null,
      supplier_name: sup?.name ?? null,
      lines,
    });
    if (res?.ok) {
      setPoLines([{ sku: "", qty: "", cost: "" }]);
      setMsg(null);
      await loadAll();
      setTab("po");
    } else setMsg(res?.error ?? "Could not create PO (offline?)");
  }

  async function receivePO(id: string) {
    const res = await window.pos.receivePurchaseOrder(id);
    if (res?.ok) await loadAll();
    else setMsg(res?.error ?? "Could not receive PO (offline?)");
  }

  const tabBtn = (t: Tab, label: string) => (
    <button className={tab === t ? "primary" : "outline"} onClick={() => setTab(t)}>
      {label}
    </button>
  );

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 4px" }}>Inventory</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Stock levels, low-stock alerts, suppliers and purchase orders.
        {lowCount > 0 && (
          <span className="badge offline" style={{ marginLeft: 8 }}>
            ⚠️ {lowCount} low-stock item{lowCount === 1 ? "" : "s"}
          </span>
        )}
      </p>

      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        {tabBtn("stock", "Stock")}
        {tabBtn("suppliers", `Suppliers (${suppliers.length})`)}
        {tabBtn("po", `Purchase Orders (${orders.length})`)}
      </div>
      {msg && <div className="muted" style={{ marginTop: 8 }}>{msg}</div>}

      {tab === "stock" && (
        <div className="panel elev" style={{ marginTop: 16 }}>
          <table style={{ width: "100%", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                <th>Product</th><th>SKU</th><th>Stock</th><th>Reorder at</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((i) => (
                <tr key={i.variant_id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td>{i.product_title} <span className="muted">{i.title}</span></td>
                  <td>{i.sku}</td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={edits[i.sku]?.stock ?? ""}
                      onChange={(e) => setEdits((p) => ({ ...p, [i.sku]: { ...p[i.sku], stock: e.target.value } }))}
                      style={{ width: 70 }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      value={edits[i.sku]?.reorder ?? ""}
                      onChange={(e) => setEdits((p) => ({ ...p, [i.sku]: { ...p[i.sku], reorder: e.target.value } }))}
                      style={{ width: 70 }}
                    />
                  </td>
                  <td>{i.low_stock ? <span className="badge offline">Low</span> : <span className="badge online">OK</span>}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="ghost" onClick={() => void saveRow(i.sku)}>Save</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "suppliers" && (
        <div className="panel elev" style={{ marginTop: 16 }}>
          <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
            <div><label>Name</label><input value={supName} onChange={(e) => setSupName(e.target.value)} /></div>
            <div><label>Phone</label><input value={supPhone} onChange={(e) => setSupPhone(e.target.value)} /></div>
            <button className="primary" onClick={() => void addSupplier()}>Add supplier</button>
          </div>
          <table style={{ width: "100%", marginTop: 14, fontSize: 13 }}>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td><strong>{s.name}</strong></td>
                  <td>{s.phone ?? "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="ghost" onClick={() => void removeSupplier(s.id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {suppliers.length === 0 && (
                <tr><td className="muted" style={{ paddingTop: 8 }}>No suppliers yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "po" && (
        <>
          <div className="panel elev" style={{ marginTop: 16 }}>
            <strong>New purchase order</strong>
            <div className="row" style={{ marginTop: 8 }}>
              <select value={poSupplier} onChange={(e) => setPoSupplier(e.target.value)}>
                <option value="">Supplier…</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {inventory.length === 0 && (
              <div className="muted" style={{ marginTop: 8 }}>
                No products loaded yet — open the <strong>Stock</strong> tab (and make sure the
                backend is reachable) so SKUs appear in the dropdown below.
              </div>
            )}
            {poLines.map((l, idx) => (
              <div className="row" key={idx} style={{ marginTop: 8, gap: 8 }}>
                <select
                  value={l.sku}
                  onChange={(e) => setPoLines((p) => p.map((x, i) => (i === idx ? { ...x, sku: e.target.value } : x)))}
                >
                  <option value="">SKU…</option>
                  {inventory.map((i) => <option key={i.sku} value={i.sku}>{i.sku} — {i.product_title}</option>)}
                </select>
                <input placeholder="Qty" type="number" min={1} value={l.qty} style={{ width: 80 }}
                  onChange={(e) => setPoLines((p) => p.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))} />
                <input placeholder="Cost ₹" type="number" min={0} value={l.cost} style={{ width: 100 }}
                  onChange={(e) => setPoLines((p) => p.map((x, i) => (i === idx ? { ...x, cost: e.target.value } : x)))} />
              </div>
            ))}
            <div className="row" style={{ marginTop: 10, gap: 8 }}>
              <button className="outline" onClick={() => setPoLines((p) => [...p, { sku: "", qty: "", cost: "" }])}>+ line</button>
              <button className="primary" onClick={() => void createPO()}>Create PO</button>
            </div>
          </div>

          <div className="panel elev" style={{ marginTop: 16 }}>
            <strong>Purchase orders</strong>
            <table style={{ width: "100%", marginTop: 10, fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                  <th>Date</th><th>Supplier</th><th>Items</th><th>Total</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td>{o.created_at ? new Date(o.created_at).toLocaleDateString() : "—"}</td>
                    <td>{o.supplier_name ?? "—"}</td>
                    <td>{(o.lines ?? []).reduce((s: number, l: any) => s + Number(l.qty), 0)}</td>
                    <td>₹{Number(o.total ?? 0).toFixed(0)}</td>
                    <td>{o.status === "received"
                      ? <span className="badge online">Received</span>
                      : <span className="badge offline">Ordered</span>}</td>
                    <td style={{ textAlign: "right" }}>
                      {o.status !== "received" && (
                        <button className="primary" onClick={() => void receivePO(o.id)}>Receive</button>
                      )}
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr><td className="muted" style={{ paddingTop: 8 }}>No purchase orders yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
