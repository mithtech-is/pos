import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

interface Props {
  amount: number;
  /** Local order number — embedded in the UPI txn ref. */
  reference: string;
  /** Merchant info pulled from local settings (configured in Settings screen). */
  vpa: string;
  payeeName: string;
  /** Called once cashier captures UTR + confirms the customer paid. */
  onPaid: (utr: string) => void;
  onCancel: () => void;
}

/**
 * UPI QR modal — replaces the old "type a UPI reference manually" flow.
 *
 * Generates a BHIM UPI deep-link QR (`upi://pay?pa=…&pn=…&am=…&tr=…`). Customer
 * scans with any UPI app (GPay, PhonePe, Paytm, BHIM, etc.); their app
 * pre-fills payee + amount + note. The customer taps Pay; cashier reads the UTR /
 * transaction id from the customer's success screen and types it here.
 *
 * No payment gateway is involved — this is the "small shop" UPI flow used
 * across India. For automated verification, swap the cashier-eyeball step
 * for a Razorpay/Cashfree webhook (out of scope for the MVP).
 */
export default function UpiQrModal({
  amount,
  reference,
  vpa,
  payeeName,
  onPaid,
  onCancel,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [utr, setUtr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  const deepLink = buildUpiDeepLink({
    vpa,
    payeeName,
    amount,
    reference,
    note: `Order ${reference}`,
  });

  useEffect(() => {
    if (!vpa) {
      setError(
        "Merchant UPI VPA not configured. Open Settings → set Merchant UPI VPA (e.g. trailblaze@hdfcbank) and try again.",
      );
      return;
    }
    QRCode.toDataURL(deepLink, {
      width: 320,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    })
      .then(setQrDataUrl)
      .catch((e) => setError(`Failed to render QR: ${e.message}`));
  }, [deepLink, vpa]);

  function submit() {
    if (!utr.trim()) {
      setError("Enter the UTR / transaction id from the customer's success screen");
      return;
    }
    onPaid(utr.trim());
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "grid",
        placeItems: "center",
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        className="panel elev"
        style={{ width: 460 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>📱 UPI payment — ₹{amount.toFixed(2)}</h3>
        <div className="muted" style={{ marginBottom: 14 }}>
          Show this QR to the customer. They scan with any UPI app
          (GPay / PhonePe / Paytm / BHIM), tap pay, then tell you the UTR.
        </div>

        {qrDataUrl && (
          <div
            style={{
              background: "white",
              padding: 14,
              borderRadius: 12,
              display: "grid",
              placeItems: "center",
              marginBottom: 12,
            }}
          >
            <img
              src={qrDataUrl}
              alt="UPI QR"
              style={{ width: 280, height: 280 }}
            />
          </div>
        )}

        <div className="muted" style={{ fontFamily: "var(--font-mono)", fontSize: 11, marginBottom: 12, wordBreak: "break-all" }}>
          {deepLink}
        </div>

        <label>UTR / Transaction id (from customer's screen)</label>
        <input
          autoFocus
          placeholder="e.g. 401234567890"
          value={utr}
          onChange={(e) => setUtr(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onCancel();
          }}
        />

        {error && (
          <div
            style={{
              marginTop: 10,
              padding: "8px 10px",
              borderRadius: 8,
              background: "rgba(239,68,68,0.12)",
              border: "1px solid rgba(239,68,68,0.35)",
              color: "#fecaca",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div className="row" style={{ marginTop: 14, justifyContent: "space-between" }}>
          <button className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <div className="row">
            <button
              className="ghost"
              onClick={() => onPaid("MANUAL-NO-UTR")}
              title="Use only when customer paid but did not share UTR"
            >
              Skip UTR
            </button>
            <button className="primary" onClick={submit} disabled={!utr.trim()}>
              Mark paid
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Build a BHIM UPI deep link per NPCI spec.
 *
 *   upi://pay?pa=<vpa>&pn=<payee>&am=<amount>&cu=INR&tn=<note>&tr=<ref>
 *
 * - `pa` (payee address — required) e.g. trailblaze@hdfcbank
 * - `pn` (payee name — required)
 * - `am` (amount — optional, fixed for dynamic QR)
 * - `cu` (currency — defaults to INR)
 * - `tn` (transaction note — appears on the customer's UPI app)
 * - `tr` (merchant txn reference — echoed back on the success screen so the
 *        cashier can match the UTR to this bill)
 */
export function buildUpiDeepLink(args: {
  vpa: string;
  payeeName: string;
  amount: number;
  reference: string;
  note?: string;
}): string {
  const params = new URLSearchParams({
    pa: args.vpa,
    pn: args.payeeName,
    am: args.amount.toFixed(2),
    cu: "INR",
    tn: args.note ?? `Bill ${args.reference}`,
    tr: args.reference,
  });
  return `upi://pay?${params.toString()}`;
}


