import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { buildIdempotencyKey, clampInt } from "@pos/shared";
import { useAuthStore } from "../state/auth";
import ManagerPinModal from "../components/ManagerPinModal";

type ReturnReason =
  | "size_issue"
  | "defective_item"
  | "wrong_product"
  | "duplicate_purchase"
  | "customer_request"
  | "other";

const REASON_LABELS: Record<ReturnReason, string> = {
  size_issue: "Size issue",
  defective_item: "Defective item",
  wrong_product: "Wrong product",
  duplicate_purchase: "Duplicate purchase",
  customer_request: "Customer request",
  other: "Other",
};

interface OrderItem {
  id: number;
  variant_id: string;
  sku: string;
  product_name: string;
  size: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface OrderRow {
  id: number;
  local_order_number: string;
  server_order_id: string | null;
  cashier_id: string;
  school_id: string;
  student_name?: string;
  parent_mobile?: string;
  grand_total: number;
  created_at: string;
  items: OrderItem[];
}

/**
 * Returns + exchanges screen.
 *
 * Flow:
 *   1. Search for an order by local order number or customer mobile.
 *   2. Pick which lines to return + quantity + reason per line.
 *   3. Pick refund mode (cash / store credit).
 *   4. Manager PIN gate (required for any return per spec § 5.1.3 FR-013).
 *   5. Queue a `return.created` sync event; backend creates the central return.
 *
 * Local stock is incremented immediately so the returned units are sellable.
 */
export default function ReturnsPage() {
  const user = useAuthStore((s) => s.user);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<OrderRow[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);
  const [lines, setLines] = useState<Record<number, { qty: number; reason: ReturnReason }>>({});
  const [refundMode, setRefundMode] = useState<"cash" | "store_credit">("cash");
  const [pinModal, setPinModal] = useState<{ description: string; onApprove: () => void } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const all = await window.pos.listLocalOrders({ limit: 200 });
      setMatches(all);
    })().catch(() => {});
  }, []);

  async function runSearch() {
    const all: OrderRow[] = await window.pos.listLocalOrders({ limit: 200 });
    const q = query.trim().toLowerCase();
    if (!q) {
      setMatches(all);
      return;
    }
    setMatches(
      all.filter(
        (o) =>
          o.local_order_number?.toLowerCase().includes(q) ||
          o.parent_mobile?.toLowerCase().includes(q) ||
          o.server_order_id?.toLowerCase().includes(q),
      ),
    );
  }

  async function openOrder(id: number) {
    const order = await window.pos.getLocalOrder(id);
    setSelectedOrder(order);
    setLines({});
    setMessage(null);
  }

  function updateLine(itemId: number, qty: number, reason: ReturnReason) {
    setLines((prev) => ({
      ...prev,
      [itemId]: { qty: Math.max(0, qty), reason },
    }));
  }

  const refundAmount = selectedOrder
    ? selectedOrder.items.reduce((sum, it) => {
        const sel = lines[it.id];
        if (!sel?.qty) return sum;
        const perUnit = it.line_total / Math.max(1, it.quantity);
        return sum + perUnit * Math.min(sel.qty, it.quantity);
      }, 0)
    : 0;

  function submit() {
    if (!user || !selectedOrder) return;
    const items = Object.entries(lines)
      .filter(([, l]) => l.qty > 0)
      .map(([itemId, l]) => {
        const orig = selectedOrder.items.find((i) => i.id === Number(itemId))!;
        const perUnit = orig.line_total / Math.max(1, orig.quantity);
        return {
          variant_id: orig.variant_id,
          sku: orig.sku,
          product_name: orig.product_name,
          quantity: l.qty,
          refund_amount: perUnit * l.qty,
          reason: l.reason,
        };
      });
    if (items.length === 0) {
      setMessage("Pick at least one line to return");
      return;
    }
    setPinModal({
      description: `Approve return of ${items.length} line(s), refund ₹${refundAmount.toFixed(2)} (${refundMode})`,
      onApprove: () => void doReturn(items, true),
    });
  }

  async function doReturn(
    items: Array<{ variant_id: string; sku: string; product_name: string; quantity: number; refund_amount: number; reason: ReturnReason }>,
    managerApproved: boolean,
  ) {
    if (!user || !selectedOrder) return;
    setBusy(true);
    setPinModal(null);
    try {
      const deviceCode = ((await window.pos.getSetting("device_code")) as string) ?? "POS001";
      const localReturnId = `RET-${selectedOrder.local_order_number}-${uuidv4().slice(0, 6)}`;
      const idempotencyKey = buildIdempotencyKey(deviceCode, localReturnId);
      const createdAt = new Date().toISOString();

      // Increment local stock for returned items (sellable again).
      for (const item of items) {
        await window.pos.applyLocalSale({
          variant_id: item.variant_id,
          quantity: -item.quantity, // negative = return adds back
        });
      }

      // Queue the return for sync to the backend.
      await window.pos.queuePush({
        event_type: "return.created",
        idempotency_key: idempotencyKey,
        payload: {
          device_id: deviceCode,
          cashier_id: user.id,
          original_order_id: selectedOrder.server_order_id ?? selectedOrder.local_order_number,
          manager_pin_verified: managerApproved,
          items,
          refund_mode: refundMode,
          idempotency_key: idempotencyKey,
          created_at: createdAt,
        },
      });

      await window.pos.audit({
        user_id: user.id,
        device_id: deviceCode,
        action: "return.created",
        data: {
          original: selectedOrder.local_order_number,
          items,
          refund_amount: refundAmount,
          refund_mode: refundMode,
        },
      });

      setMessage(`Return ${localReturnId} queued · refund ₹${refundAmount.toFixed(2)} ${refundMode}`);
      setSelectedOrder(null);
      setLines({});
    } catch (err) {
      setMessage(`Return failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 12, display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Find order</h2>
        <input
          placeholder="Local # or customer mobile"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runSearch();
          }}
        />
        <button onClick={runSearch} style={{ marginTop: 8, width: "100%" }}>
          Search
        </button>
        <div style={{ marginTop: 12, maxHeight: 460, overflow: "auto" }}>
          {matches.length === 0 ? (
            <div className="muted">No orders match.</div>
          ) : (
            matches.map((o) => (
              <div
                key={o.id}
                className="product-card"
                onClick={() => openOrder(o.id)}
                style={{
                  border:
                    selectedOrder?.id === o.id
                      ? "1px solid var(--accent)"
                      : undefined,
                }}
              >
                <div>
                  <div>{o.local_order_number}</div>
                  <div className="muted">
                    {o.parent_mobile ?? "no mobile"} · ₹{Number(o.grand_total ?? 0).toFixed(2)}
                  </div>
                </div>
                <div className="muted" style={{ fontSize: 11 }}>
                  {(o.created_at ?? "").slice(0, 10)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Return items</h2>
        {!selectedOrder ? (
          <div className="muted">Pick an order on the left.</div>
        ) : (
          <>
            <div className="muted">
              Order: <b>{selectedOrder.local_order_number}</b> · Customer:{" "}
              {selectedOrder.student_name ?? "—"} · Mobile:{" "}
              {selectedOrder.parent_mobile ?? "—"}
            </div>
            <table style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Sold qty</th>
                  <th>Return qty</th>
                  <th>Reason</th>
                  <th>Refund</th>
                </tr>
              </thead>
              <tbody>
                {selectedOrder.items.map((it) => {
                  const sel = lines[it.id];
                  const perUnit = it.line_total / Math.max(1, it.quantity);
                  return (
                    <tr key={it.id}>
                      <td>
                        {it.product_name}
                        <div className="muted">size {it.size}</div>
                      </td>
                      <td>{it.quantity}</td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          max={it.quantity}
                          value={sel?.qty ?? 0}
                          onChange={(e) =>
                            updateLine(
                              it.id,
                              clampInt(e.target.value, 0, it.quantity),
                              sel?.reason ?? "size_issue",
                            )
                          }
                          style={{ width: 70 }}
                        />
                      </td>
                      <td>
                        <select
                          value={sel?.reason ?? "size_issue"}
                          onChange={(e) =>
                            updateLine(
                              it.id,
                              sel?.qty ?? 0,
                              e.target.value as ReturnReason,
                            )
                          }
                        >
                          {Object.entries(REASON_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        ₹
                        {(perUnit * (sel?.qty ?? 0)).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="row" style={{ marginTop: 14, alignItems: "center" }}>
              <div>
                <label>Refund mode</label>
                <select
                  value={refundMode}
                  onChange={(e) => setRefundMode(e.target.value as any)}
                >
                  <option value="cash">Cash</option>
                  <option value="store_credit">Store credit</option>
                </select>
              </div>
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div className="muted">Refund total</div>
                <div style={{ fontSize: 22, fontWeight: 600 }}>
                  ₹{refundAmount.toFixed(2)}
                </div>
              </div>
              <button
                className="primary"
                onClick={submit}
                disabled={busy || refundAmount <= 0}
              >
                {busy ? "Submitting…" : "Process return"}
              </button>
            </div>
            {message && (
              <div style={{ marginTop: 10, color: "var(--text-soft)" }}>
                {message}
              </div>
            )}
          </>
        )}
      </div>

      {pinModal && (
        <ManagerPinModal
          action="return"
          description={pinModal.description}
          onApprove={pinModal.onApprove}
          onCancel={() => setPinModal(null)}
        />
      )}
    </div>
  );
}
