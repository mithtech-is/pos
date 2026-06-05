import { useEffect, useState } from "react";

/**
 * Stores / outlets (multi-store). Create and manage branches; each is
 * selectable as the "outlet" at checkout, and sales are reported per store on
 * the Analytics page. Creating a store triggers a sync so it appears in the
 * checkout outlet dropdown. Online-only (back-office).
 */
export default function StoresPage() {
  const [stores, setStores] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [city, setCity] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await window.pos.listStores();
    if (r?.ok && Array.isArray(r.data)) setStores(r.data);
    else if (r?.error) setMsg("Could not load stores — backend may be offline.");
  }
  useEffect(() => {
    void load().catch(() => {});
  }, []);

  async function create() {
    if (!name.trim() || !code.trim()) {
      setMsg("Name and code are required.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await window.pos.saveStore({
        name: name.trim(),
        code: code.trim().toUpperCase(),
        city: city.trim(),
      });
      if (r?.ok) {
        setName("");
        setCode("");
        setCity("");
        await load();
        await window.pos.syncTick(); // pull so the new store shows in checkout
      } else {
        setMsg(r?.error ?? "Could not create store — backend may be offline.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggle(s: any) {
    const r = await window.pos.setStoreActive({ id: s.id, active: s.status !== "active" });
    if (r?.ok) await load();
    else setMsg(r?.error ?? "Could not update store.");
  }

  return (
    <main style={{ padding: 24, maxWidth: 820, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 4px" }}>Stores</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Branches / outlets. Each sale is tagged with the outlet picked at checkout, and the
        Analytics page breaks sales down by store. New stores sync to the checkout dropdown.
      </p>

      <div className="panel elev" style={{ marginTop: 12 }}>
        <strong>New store</strong>
        <div className="row" style={{ gap: 8, marginTop: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div><label>Name</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Downtown Branch" /></div>
          <div><label>Code</label><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="DT1" style={{ width: 100 }} /></div>
          <div><label>City</label><input value={city} onChange={(e) => setCity(e.target.value)} placeholder="optional" /></div>
          <button className="primary" disabled={busy} onClick={() => void create()}>{busy ? "Saving…" : "Add store"}</button>
        </div>
        {msg && <div className="muted" style={{ marginTop: 8 }}>{msg}</div>}
      </div>

      <div className="panel elev" style={{ marginTop: 16 }}>
        <strong>All stores ({stores.length})</strong>
        {stores.length === 0 ? (
          <div className="muted" style={{ marginTop: 8 }}>No stores yet.</div>
        ) : (
          <table style={{ width: "100%", marginTop: 10, fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                <th>Name</th><th>Code</th><th>City</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => (
                <tr key={s.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td><strong>{s.name}</strong></td>
                  <td>{s.code}</td>
                  <td>{s.city ?? "—"}</td>
                  <td>{s.status === "active"
                    ? <span className="badge online">Active</span>
                    : <span className="badge offline">Inactive</span>}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="ghost" onClick={() => void toggle(s)}>
                      {s.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
