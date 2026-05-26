import { useEffect, useRef, useState } from "react";

interface Props {
  /** What the cashier is trying to do — shown to the manager and audit-logged. */
  action: string;
  /** Human-readable description of the action (e.g. "Apply 25% discount") */
  description?: string;
  /** Called with the manager identity (or "offline" marker) on success. */
  onApprove: (info: { source: "online" | "offline"; manager_user_id?: string }) => void;
  /** Called when the user cancels. */
  onCancel: () => void;
}

/**
 * Reusable manager-PIN approval modal.
 *
 * Calls `window.pos.verifyManagerPin` which tries the backend, falls back to
 * locally cached manager_pin_hashes if offline. Cancels on Esc, submits on Enter.
 * The PIN never leaves the device unencrypted — only the salted hash is checked.
 */
export default function ManagerPinModal({ action, description, onApprove, onCancel }: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit() {
    if (!pin) {
      setError("Enter the manager PIN");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await window.pos.verifyManagerPin({ pin, action });
      if (res.ok) {
        onApprove({ source: res.source, manager_user_id: res.manager_user_id });
      } else {
        setError("PIN did not match any manager on file");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "grid",
        placeItems: "center",
        zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        className="panel"
        style={{ width: 380 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0 }}>Manager approval required</h3>
        <div className="muted" style={{ marginBottom: 8 }}>
          {description ?? `Action: ${action}`}
        </div>
        <label>Manager PIN</label>
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onCancel();
          }}
        />
        {error && (
          <div style={{ color: "var(--danger)", marginTop: 8 }}>{error}</div>
        )}
        <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
          <button className="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="primary" onClick={submit} disabled={busy}>
            {busy ? "Verifying…" : "Approve"}
          </button>
        </div>
      </div>
    </div>
  );
}
