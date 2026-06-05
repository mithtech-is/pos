import { useEffect, useState } from "react";
import {
  sanitizeNumericInput,
  INPUT_LIMITS,
  type PosPromotion,
  type PosPromotionType,
} from "@pos/shared";

/**
 * Promotions management. Coupons live on the backend (store metadata) and are
 * cached locally for offline use at checkout. Creating/deleting needs the
 * backend online; applying a cached coupon works offline.
 */
export default function PromotionsPage() {
  const [promos, setPromos] = useState<PosPromotion[]>([]);
  const [code, setCode] = useState("");
  const [type, setType] = useState<PosPromotionType>("percent");
  const [value, setValue] = useState("");
  const [minSubtotal, setMinSubtotal] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await window.pos.listPromotions();
    if (res?.ok && Array.isArray(res.data)) setPromos(res.data);
  }
  useEffect(() => {
    void load().catch(() => {});
  }, []);

  async function create() {
    const c = code.trim().toUpperCase();
    if (!c) {
      setMsg("Code is required.");
      return;
    }
    if (type !== "bogo" && !(Number(value) > 0)) {
      setMsg("Enter a value greater than 0.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await window.pos.savePromotion({
        code: c,
        type,
        value: Number(value) || 0,
        min_subtotal: minSubtotal ? Math.max(0, Number(minSubtotal) || 0) : null,
        starts_at: startsAt || null,
        ends_at: endsAt || null,
        active: true,
      });
      if (res?.ok && Array.isArray(res.data)) {
        setPromos(res.data);
        setCode("");
        setValue("");
        setMinSubtotal("");
        setStartsAt("");
        setEndsAt("");
      } else {
        setMsg(res?.error ?? "Could not save — backend may be offline.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const res = await window.pos.deletePromotion(id);
    if (res?.ok && Array.isArray(res.data)) setPromos(res.data);
    else setMsg(res?.error ?? "Could not delete — backend may be offline.");
  }

  function describe(p: PosPromotion): string {
    if (p.type === "percent") return `${p.value}% off`;
    if (p.type === "flat") return `₹${p.value} off`;
    return "Buy 1 Get 1 (cheapest free)";
  }

  return (
    <main style={{ padding: 24, maxWidth: 920, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 4px" }}>Promotions</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Coupon codes applied at checkout. Percent / flat ₹ / BOGO, with an optional minimum
        and validity window. Cached on each terminal so they work offline.
      </p>

      <div className="panel elev" style={{ marginTop: 12 }}>
        <strong>New promotion</strong>
        <div className="row" style={{ gap: 12, marginTop: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label>Code</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="DIWALI10" style={{ width: 140 }} />
          </div>
          <div>
            <label>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as PosPromotionType)}>
              <option value="percent">% off</option>
              <option value="flat">₹ off</option>
              <option value="bogo">BOGO (cheapest free)</option>
            </select>
          </div>
          {type !== "bogo" && (
            <div>
              <label>{type === "percent" ? "Percent" : "Amount (₹)"}</label>
              <input
                value={value}
                onChange={(e) =>
                  setValue(
                    sanitizeNumericInput(e.target.value, {
                      max: type === "percent" ? INPUT_LIMITS.PERCENT_MAX : INPUT_LIMITS.PRICE_MAX,
                      decimals: type !== "percent",
                    }),
                  )
                }
                type="number"
                min={0}
                max={type === "percent" ? INPUT_LIMITS.PERCENT_MAX : INPUT_LIMITS.PRICE_MAX}
                style={{ width: 100 }}
              />
            </div>
          )}
          <div>
            <label>Min subtotal (₹)</label>
            <input
              value={minSubtotal}
              onChange={(e) =>
                setMinSubtotal(sanitizeNumericInput(e.target.value, { max: INPUT_LIMITS.PRICE_MAX, decimals: true }))
              }
              type="number"
              min={0}
              max={INPUT_LIMITS.PRICE_MAX}
              placeholder="optional"
              style={{ width: 120 }}
            />
          </div>
          <div>
            <label>Starts</label>
            <input value={startsAt} onChange={(e) => setStartsAt(e.target.value)} type="date" />
          </div>
          <div>
            <label>Ends</label>
            <input value={endsAt} onChange={(e) => setEndsAt(e.target.value)} type="date" />
          </div>
          <button className="primary" disabled={busy} onClick={() => void create()}>
            {busy ? "Saving…" : "Add"}
          </button>
        </div>
        {msg && <div className="muted" style={{ marginTop: 8 }}>{msg}</div>}
      </div>

      <div className="panel elev" style={{ marginTop: 16 }}>
        <strong>Active promotions ({promos.length})</strong>
        {promos.length === 0 ? (
          <div className="muted" style={{ marginTop: 8 }}>No promotions yet.</div>
        ) : (
          <table style={{ width: "100%", marginTop: 10, fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                <th>Code</th>
                <th>Offer</th>
                <th>Min ₹</th>
                <th>Window</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {promos.map((p) => (
                <tr key={p.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td><strong>{p.code}</strong></td>
                  <td>{describe(p)}</td>
                  <td>{p.min_subtotal ?? "—"}</td>
                  <td>
                    {p.starts_at || p.ends_at
                      ? `${p.starts_at?.slice(0, 10) ?? "…"} → ${p.ends_at?.slice(0, 10) ?? "…"}`
                      : "always"}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <button className="ghost" onClick={() => void remove(p.id)}>Delete</button>
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
