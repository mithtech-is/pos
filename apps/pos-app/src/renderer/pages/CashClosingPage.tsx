import { useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { useAuthStore } from "../state/auth";

/**
 * Cash-closing screen — used by cashiers at end of shift.
 *
 * Workflow:
 *   1. Cashier records the opening float (cash in drawer at start of shift).
 *   2. UI sums today's orders by payment mode from local_orders.
 *   3. Cashier enters the actual cash count and any notes.
 *   4. Submit creates a local audit + queues cash.closed for sync.
 *
 * All math is local; works offline. The backend records the closing in
 * audit_logs via the cashClosingWorkflow when the queue drains.
 */
export default function CashClosingPage() {
  const user = useAuthStore((s) => s.user);
  const [orders, setOrders] = useState<any[]>([]);
  const [openingFloat, setOpeningFloat] = useState(0);
  const [countedCash, setCountedCash] = useState(0);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const list: any[] = await window.pos.listLocalOrders({ limit: 500 });
      setOrders(list.filter((o) => (o.created_at ?? "").startsWith(today)));
      const savedFloat = (await window.pos.getSetting("opening_float")) as number | null;
      if (typeof savedFloat === "number") setOpeningFloat(savedFloat);
    })().catch(() => {});
  }, []);

  const totals = useMemo(() => {
    let cash = 0, upi = 0, credit = 0, card = 0;
    for (const o of orders) {
      const amt = Number(o.grand_total ?? 0);
      switch (o.payment_mode) {
        case "cash": cash += amt; break;
        case "upi": upi += amt; break;
        case "credit": credit += amt; break;
        case "card": card += amt; break;
      }
    }
    return { cash, upi, credit, card };
  }, [orders]);

  const expectedCash = openingFloat + totals.cash;
  const variance = countedCash - expectedCash;
  const grossTotal = totals.cash + totals.upi + totals.card + totals.credit;

  async function openShift() {
    setBusy(true);
    try {
      await window.pos.setSetting({ key: "opening_float", value: openingFloat });
      await window.pos.setSetting({ key: "shift_opened_at", value: new Date().toISOString() });
      setMessage(`Shift opened with ₹${openingFloat.toFixed(2)} float`);
    } finally {
      setBusy(false);
    }
  }

  async function closeShift() {
    if (!user) return;
    setBusy(true);
    setMessage(null);
    try {
      const deviceCode = ((await window.pos.getSetting("device_code")) as string) ?? "POS001";
      const openedAt =
        ((await window.pos.getSetting("shift_opened_at")) as string) ??
        new Date().toISOString();
      const closedAt = new Date().toISOString();
      const idempotencyKey = `${deviceCode}:cash-closing:${closedAt}:${uuidv4().slice(0, 8)}`;
      await window.pos.queuePush({
        event_type: "cash.closed",
        idempotency_key: idempotencyKey,
        payload: {
          device_id: deviceCode,
          cashier_id: user.id,
          opened_at: openedAt,
          closed_at: closedAt,
          cash_in_drawer: countedCash,
          cash_collected: totals.cash,
          upi_collected: totals.upi,
          card_collected: totals.card,
          credit_outstanding: totals.credit,
          opening_float: openingFloat,
          expected_cash: expectedCash,
          variance,
          notes,
          idempotency_key: idempotencyKey,
        },
      });
      await window.pos.audit({
        user_id: user.id,
        device_id: deviceCode,
        action: "cash.closed",
        data: { totals, expectedCash, countedCash, variance, notes },
      });
      await window.pos.setSetting({ key: "opening_float", value: 0 });
      await window.pos.setSetting({ key: "shift_opened_at", value: null });
      setMessage(
        variance === 0
          ? `Shift closed clean — no variance.`
          : `Shift closed with variance of ₹${variance.toFixed(2)}.`,
      );
      setOpeningFloat(0);
      setCountedCash(0);
      setNotes("");
    } catch (err) {
      setMessage(`Close failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div className="col">
        <div className="panel elev">
          <h2 style={{ marginTop: 0 }}>📊 Today's collection</h2>
          <div className="muted" style={{ marginBottom: 12 }}>
            {orders.length} order{orders.length !== 1 ? "s" : ""} · gross ₹{grossTotal.toFixed(2)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="stat success">
              <div className="label">💵 Cash</div>
              <div className="value">₹{totals.cash.toFixed(0)}</div>
            </div>
            <div className="stat info">
              <div className="label">📱 UPI</div>
              <div className="value">₹{totals.upi.toFixed(0)}</div>
            </div>
            <div className="stat">
              <div className="label">💳 Card</div>
              <div className="value">₹{totals.card.toFixed(0)}</div>
            </div>
            <div className="stat warning">
              <div className="label">📒 Credit</div>
              <div className="value">₹{totals.credit.toFixed(0)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="panel elev">
        <h2 style={{ marginTop: 0 }}>🔐 Shift management</h2>
        <div className="muted" style={{ marginBottom: 16 }}>
          Record cash counts to close the day. Variance over ₹100 turns red.
        </div>
        <div className="col">
          <div>
            <label>Opening float (drawer at start of shift)</label>
            <input
              type="number"
              min={0}
              step={50}
              value={openingFloat || ""}
              onChange={(e) => setOpeningFloat(Number(e.target.value) || 0)}
              placeholder="0"
            />
          </div>
          <button className="ghost" onClick={openShift} disabled={busy}>
            Save opening float
          </button>
          <hr className="divider" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="stat">
              <div className="label">Expected cash</div>
              <div className="value">₹{expectedCash.toFixed(0)}</div>
              <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
                opening + cash sales
              </div>
            </div>
            <div
              className={`stat ${
                variance === 0
                  ? "success"
                  : Math.abs(variance) > 100
                    ? "danger"
                    : "warning"
              }`}
            >
              <div className="label">Variance</div>
              <div className="value">
                {variance >= 0 ? "+" : ""}₹{variance.toFixed(0)}
              </div>
            </div>
          </div>
          <div>
            <label>Counted cash (physical count)</label>
            <input
              type="number"
              min={0}
              step={50}
              value={countedCash || ""}
              onChange={(e) => setCountedCash(Number(e.target.value) || 0)}
              placeholder="0"
            />
          </div>
          <div>
            <label>Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for variance, missing receipts, etc."
            />
          </div>
          <button className="primary lg" onClick={closeShift} disabled={busy}>
            {busy ? "Closing…" : "Close shift"}
          </button>
          {message && (
            <div className="muted" style={{ color: "var(--info)" }}>{message}</div>
          )}
        </div>
      </div>
    </div>
  );
}
