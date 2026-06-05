import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clampInt } from "@pos/shared";
import { useCartStore } from "../state/cart";

/** Catalog page backed by the local offline product cache. */

interface ProductRow {
  id: string;
  name: string;
  category: string | null;
  school_id: string | null;
  uniform_type: string | null;
  min_price: number;
  max_price: number;
  variant_count: number;
  school_name: string | null;
  school_code: string | null;
  thumbnail_url?: string | null;
}

interface Variant {
  id: string;
  product_name: string;
  sku: string;
  size: string | null;
  color: string | null;
  fabric: string | null;
  gender: string | null;
  price: number;
  tax_rate: number;
}

function inr(n: number): string {
  return `₹${Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export default function ProductsPage() {
  const cart = useCartStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const h = setTimeout(async () => {
      const list = (await window.pos.listProducts({ query: query.trim() || undefined })) as ProductRow[];
      if (!cancelled) {
        setItems(list ?? []);
        setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [query]);

  // Auto-dismiss toast after 2.4s.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(id);
  }, [toast]);

  function priceLabel(p: ProductRow): string {
    if (p.min_price === p.max_price) return inr(p.min_price);
    return `${inr(p.min_price)} — ${inr(p.max_price)}`;
  }

  function onAdded(label: string) {
    setToast({ kind: "success", msg: `Added ${label}` });
    setActiveProductId(null);
  }

  return (
    <div className="products-page">
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 32, marginBottom: 4 }}>Catalog</h2>
        <div className="muted">
          Browse synced products, confirm options, and add items to checkout.
          The catalog stays available from the local cache when offline.
        </div>
      </div>

      <div className="products-toolbar">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by product name, SKU, or barcode..."
        />
        <span className="muted">
          {loading ? "Loading..." : `${items.length} ${items.length === 1 ? "item" : "items"}`}
        </span>
        <span className="spacer" />
        <button className="outline" onClick={() => navigate("/pos")}>
          Open Checkout
        </button>
      </div>

      {loading ? (
        <div className="products-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="product-tile">
              <div className="thumb" />
              <div className="name" style={{ background: "var(--surface-3)", height: 14, borderRadius: 4 }} />
              <div className="sub" style={{ background: "var(--surface-3)", height: 10, borderRadius: 4, marginTop: 6, width: "40%" }} />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div
          className="panel"
          style={{ textAlign: "center", padding: 48, color: "var(--muted)" }}
        >
          <div style={{ fontSize: 48, marginBottom: 10, opacity: 0.5 }}>📭</div>
          {query
            ? `No listings match "${query}"`
            : "No items in the catalog yet. Pull sync to fetch the latest products."}
        </div>
      ) : (
        <div className="products-grid">
          {items.map((p) => (
            <div
              key={p.id}
              className="product-tile"
              onClick={() => setActiveProductId(p.id)}
            >
              <div className="thumb">
                {p.thumbnail_url ? (
                  <img src={p.thumbnail_url} alt={p.name} />
                ) : (
                  <span>📈</span>
                )}
              </div>
              <div className="name">{p.name}</div>
              <div className="sub">
                {p.variant_count} {p.variant_count === 1 ? "option" : "options"}
              </div>
              <div className="price">{priceLabel(p)}</div>
            </div>
          ))}
        </div>
      )}

      <ProductDetailModal
        productId={activeProductId}
        onClose={() => setActiveProductId(null)}
        onAdd={(variant, qty) => {
          cart.addLine({
            variant_id: variant.id,
            sku: variant.sku,
            product_name: variant.product_name,
            size: variant.size ?? "",
            quantity: qty,
            unit_price: variant.price,
            discount: 0,
            tax_rate: variant.tax_rate ?? 0,
          });
          onAdded(`${variant.product_name}${variant.size ? ` · ${variant.size}` : ""}`);
        }}
      />

      {toast && (
        <div className={`toast ${toast.kind}`}>
          {toast.kind === "success" ? "✓" : "⚠️"} {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   ProductDetailModal
   ============================================================ */
function ProductDetailModal({
  productId,
  onClose,
  onAdd,
}: {
  productId: string | null;
  onClose: () => void;
  onAdd: (v: Variant, qty: number) => void;
}) {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!productId) return;
    setLoading(true);
    setQty(1);
    setSelectedId(null);
    (async () => {
      const list = (await window.pos.listVariantsForProduct(productId)) as Variant[];
      setVariants(list);
      if (list.length === 1) setSelectedId(list[0].id);
      setLoading(false);
    })().catch(() => {
      setVariants([]);
      setLoading(false);
    });
  }, [productId]);

  const selected = useMemo(
    () => variants.find((v) => v.id === selectedId) ?? null,
    [variants, selectedId],
  );

  const sizes = useMemo(
    () =>
      Array.from(
        new Set(variants.map((v) => v.size).filter(Boolean) as string[]),
      ),
    [variants],
  );
  const colors = useMemo(
    () =>
      Array.from(
        new Set(variants.map((v) => v.color).filter(Boolean) as string[]),
      ),
    [variants],
  );

  function pickBySize(size: string) {
    const candidate = variants.find((v) => v.size === size);
    if (candidate) setSelectedId(candidate.id);
  }
  function pickByColor(color: string) {
    if (selected) {
      const match = variants.find(
        (v) => v.color === color && v.size === selected.size,
      );
      if (match) {
        setSelectedId(match.id);
        return;
      }
    }
    const fallback = variants.find((v) => v.color === color);
    if (fallback) setSelectedId(fallback.id);
  }

  if (!productId) return null;
  const productName = variants[0]?.product_name ?? "Loading...";

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{productName}</h2>
          <button className="ghost" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div
          style={{
            width: "100%",
            aspectRatio: "1 / 1",
            maxHeight: 220,
            borderRadius: "var(--radius)",
            background: "var(--surface-3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 80,
            opacity: 0.4,
            marginBottom: 16,
          }}
        >
          📈
        </div>

        {loading ? (
          <div className="muted">Loading options...</div>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <div className="muted">Unit price</div>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 2 }}>
                {selected ? inr(selected.price) : "Pick an option"}
              </div>
            </div>

            {sizes.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label>Option</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {sizes.map((s) => (
                    <div
                      key={s}
                      onClick={() => pickBySize(s)}
                      className={`variant-chip ${selected?.size === s ? "active" : ""}`}
                    >
                      {s}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {colors.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label>Variant group</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {colors.map((c) => (
                    <div
                      key={c}
                      onClick={() => pickByColor(c)}
                      className={`variant-chip ${selected?.color === c ? "active" : ""}`}
                    >
                      {c}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label>Quantity</label>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  className="outline"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={qty <= 1}
                  style={{ width: 40, height: 40, padding: 0, justifyContent: "center" }}
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={qty}
                  onChange={(e) => setQty(clampInt(e.target.value, 1, 99))}
                  style={{ width: 80, textAlign: "center" }}
                />
                <button
                  className="outline"
                  onClick={() => setQty((q) => q + 1)}
                  style={{ width: 40, height: 40, padding: 0, justifyContent: "center" }}
                >
                  +
                </button>
              </div>
            </div>

            <button
              className="primary lg"
              style={{ width: "100%", justifyContent: "center" }}
              disabled={!selected}
              onClick={() => selected && onAdd(selected, qty)}
            >
              {selected
                ? `Add to checkout · ${inr(selected.price * qty)}`
                : "Pick an option"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
