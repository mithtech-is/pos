import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * Add Product by Scan.
 *
 * Scanner-first catalog entry: the barcode field stays focused, so scanning an
 * item (USB scanner = keyboard that types the code + Enter) captures it. If the
 * barcode is already in the catalog we say so; otherwise a small form appears
 * pre-filled with the scanned code — enter a name + price and it creates the
 * product on the backend, then the local catalog refreshes so the item is
 * immediately scannable on the Checkout screen.
 *
 * Requires the terminal to be online (creating catalog products is not queued
 * offline — billing/scanning stays fully offline-capable).
 */
type Phase = "scanning" | "form";

export default function AddProductPage() {
  const [phase, setPhase] = useState<Phase>("scanning");
  const [barcode, setBarcode] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err" | "info"; msg: string } | null>(null);

  const scanRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Keep the scanner field focused while we're waiting for a scan.
  useEffect(() => {
    if (phase !== "scanning") return;
    const t = setInterval(() => {
      const active = document.activeElement;
      if (!active || active === document.body || active === document.documentElement) {
        scanRef.current?.focus();
      }
    }, 500);
    scanRef.current?.focus();
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  async function handleScan(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    setBarcode(trimmed);
    try {
      const existing = await window.pos.findByBarcode(trimmed);
      if (existing) {
        const label = (existing as any).product_name ?? (existing as any).sku ?? trimmed;
        setToast({ kind: "info", msg: `"${label}" already exists for ${trimmed}.` });
        setBarcode("");
        return;
      }
    } catch {
      /* offline / local miss — proceed to create form */
    }
    setName("");
    setPrice("");
    setCategory("");
    setPhase("form");
    setTimeout(() => nameRef.current?.focus(), 50);
  }

  async function submit() {
    const amount = Number(price);
    if (!name.trim() || !(amount > 0)) {
      setToast({ kind: "err", msg: "Enter a product name and a price greater than 0." });
      return;
    }
    setBusy(true);
    try {
      const res = await window.pos.createProductByScan({
        barcode,
        name: name.trim(),
        price: amount,
        category: category.trim() || undefined,
      });
      if (res?.ok) {
        const created = res.data ?? {};
        if (created.already_exists) {
          setToast({ kind: "info", msg: `"${created.title ?? barcode}" already existed.` });
        } else {
          setToast({ kind: "ok", msg: `Added "${name.trim()}" (${barcode}) — now scannable.` });
        }
        resetToScan();
      } else {
        setToast({ kind: "err", msg: res?.error ?? "Could not add product. Are you online?" });
      }
    } catch (e) {
      setToast({ kind: "err", msg: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  function resetToScan() {
    setBarcode("");
    setName("");
    setPrice("");
    setCategory("");
    setPhase("scanning");
    setTimeout(() => scanRef.current?.focus(), 50);
  }

  return (
    <main style={{ padding: 24, maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 4px" }}>Add Product by Scan</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Scan a barcode to add a new product to the catalog. Existing barcodes are detected
        automatically. New products become scannable on Checkout right away.
      </p>

      {toast && (
        <div
          style={{
            margin: "12px 0",
            padding: "10px 14px",
            borderRadius: 8,
            fontWeight: 600,
            color:
              toast.kind === "ok"
                ? "var(--success-fg, #1f6b17)"
                : toast.kind === "err"
                  ? "var(--danger-fg, #c01f1f)"
                  : "var(--text)",
            background:
              toast.kind === "ok"
                ? "var(--success-bg, #b9f1b2)"
                : toast.kind === "err"
                  ? "var(--danger-bg, #ffdfdf)"
                  : "var(--panel-2, #f1f1f1)",
            border: "1px solid var(--border)",
          }}
        >
          {toast.msg}
        </div>
      )}

      <div
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
          Barcode
        </label>
        <input
          ref={scanRef}
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && phase === "scanning") {
              e.preventDefault();
              void handleScan(barcode);
            }
          }}
          placeholder="Scan or type a barcode, then press Enter"
          readOnly={phase === "form"}
          style={inputStyle}
        />

        {phase === "form" && (
          <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
            <div>
              <label style={labelStyle}>Product name</label>
              <input
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void submit()}
                placeholder="e.g. Classic T-Shirt"
                style={inputStyle}
              />
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Price (₹)</label>
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void submit()}
                  placeholder="0.00"
                  inputMode="decimal"
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Category (optional)</label>
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void submit()}
                  placeholder="e.g. Apparel"
                  style={inputStyle}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
              <button onClick={() => void submit()} disabled={busy} style={primaryBtn}>
                {busy ? "Adding…" : "Add product"}
              </button>
              <button onClick={resetToScan} disabled={busy} style={ghostBtn}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontSize: 16,
  borderRadius: 8,
  border: "1px solid var(--border-strong, #d4d4d4)",
  background: "var(--bg)",
  color: "var(--text)",
  boxSizing: "border-box",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontWeight: 600,
  marginBottom: 6,
  fontSize: 13,
};

const primaryBtn: CSSProperties = {
  padding: "10px 18px",
  fontSize: 15,
  fontWeight: 700,
  borderRadius: 8,
  border: "none",
  cursor: "pointer",
  background: "var(--primary, #282828)",
  color: "var(--primary-fg, #ffffff)",
};

const ghostBtn: CSSProperties = {
  padding: "10px 18px",
  fontSize: 15,
  fontWeight: 600,
  borderRadius: 8,
  cursor: "pointer",
  background: "transparent",
  color: "var(--text)",
  border: "1px solid var(--border-strong, #d4d4d4)",
};
