import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../state/auth";

interface DemoCred {
  email: string;
  password: string;
  role: "cashier" | "manager";
}

const DEMO_CREDS: DemoCred[] = [
  { email: "cashier@pos.local", password: "cashier12345", role: "cashier" },
  { email: "manager@pos.local", password: "manager12345", role: "manager" },
];

/**
 * Login screen.
 *
 *   • Online: hits /pos/auth/login (real Medusa auth via emailpass).
 *   • Offline PIN: verify against locally cached pin_hash.
 *
 * In dev we surface the demo credentials so testers don't have to remember
 * them. Click a chip to autofill.
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);

  const [mode, setMode] = useState<"online" | "offline">("online");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [backendUrl, setBackendUrl] = useState("http://localhost:9000");
  const [deviceCode, setDeviceCode] = useState("POS001");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const savedUrl = await window.pos.getSetting("backend_url");
      const savedCode = await window.pos.getSetting("device_code");
      if (savedUrl) setBackendUrl(savedUrl as string);
      if (savedCode) setDeviceCode(savedCode as string);
      const list = await window.pos.listUsers();
      setUsers(list ?? []);
      if (list?.length) setSelectedUserId(list[0].id);
    })().catch(() => {});
  }, []);

  async function loginOnline() {
    setError(null);
    setBusy(true);
    try {
      await window.pos.setBackendUrl(backendUrl);
      await window.pos.setDeviceCode(deviceCode);
      const res = await fetch(`${backendUrl}/pos/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, device_code: deviceCode }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.success === false) {
        throw new Error(
          payload?.error?.message ??
            `HTTP ${res.status} — check email and password`,
        );
      }
      const data = payload.data ?? payload;
      await window.pos.onLogin({
        backend_url: backendUrl,
        access_token: data.access_token,
        user: data.user,
      });
      setUser({
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        role: data.user.role,
      });
      navigate("/pos");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function loginOffline() {
    setError(null);
    setBusy(true);
    try {
      if (!selectedUserId) throw new Error("Pick a user");
      const result = await window.pos.verifyPin({ user_id: selectedUserId, pin });
      if (!result.ok) throw new Error(result.reason);
      const user = users.find((u) => u.id === selectedUserId);
      if (!user) throw new Error("User not found");
      setUser({ id: user.id, name: user.name, email: user.email, role: user.role });
      navigate("/pos");
    } catch (err) {
      setError(`Offline unlock failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function useCred(c: DemoCred) {
    setEmail(c.email);
    setPassword(c.password);
    setError(null);
  }

  return (
    <div className="login-shell">
      <div className="login-hero">
        <span className="badge info">
          <span className="dot" /> Offline-first dealing terminal
        </span>
        <h1>Polemarch</h1>
        <p>
          Unlisted shares dealing terminal. Book trades for clients across any
          private-company scrip — even when the network drops. Every trade
          queues locally and syncs to compliance once you're back online.
        </p>
        <div className="panel" style={{ marginTop: 16 }}>
          <strong style={{ fontSize: 13 }}>Demo credentials</strong>
          <div className="muted" style={{ marginBottom: 10 }}>
            Click to autofill (dealer = cashier role, compliance = manager role).
          </div>
          <div className="col" style={{ gap: 8 }}>
            {DEMO_CREDS.map((c) => (
              <div
                key={c.email}
                className="cred-chip"
                onClick={() => useCred(c)}
                title="Click to use these credentials"
              >
                <div>
                  <div style={{ color: "var(--text)" }}>{c.email}</div>
                  <div style={{ color: "var(--muted)" }}>{c.password}</div>
                </div>
                <span className="role">
                  {c.role === "manager" ? "Compliance" : "Dealer"}
                </span>
              </div>
            ))}
          </div>
          <div className="muted" style={{ marginTop: 10, fontSize: 11 }}>
            Compliance PIN for price-deviation / reversal approvals:{" "}
            <span className="kbd">9999</span>
          </div>
        </div>
      </div>

      <div className="login-card panel elev">
        <h2 style={{ marginTop: 0 }}>Dealer sign-in</h2>
        <div className="muted" style={{ marginBottom: 16 }}>
          {mode === "online"
            ? "First login must be online. After that, offline PIN works."
            : "Pick a dealer who has signed in here before and enter their PIN."}
        </div>
        <div className="row" style={{ marginBottom: 16 }}>
          <button
            className={mode === "online" ? "primary flex-1" : "ghost flex-1"}
            onClick={() => setMode("online")}
            style={{ justifyContent: "center" }}
          >
            Online sign-in
          </button>
          <button
            className={mode === "offline" ? "primary flex-1" : "ghost flex-1"}
            onClick={() => setMode("offline")}
            disabled={users.length === 0}
            style={{ justifyContent: "center" }}
          >
            Offline PIN
          </button>
        </div>

        {mode === "online" ? (
          <div className="col">
            <div className="row">
              <div className="flex-1">
                <label>Backend URL</label>
                <input value={backendUrl} onChange={(e) => setBackendUrl(e.target.value)} />
              </div>
              <div style={{ width: 120 }}>
                <label>Device</label>
                <input value={deviceCode} onChange={(e) => setDeviceCode(e.target.value)} />
              </div>
            </div>
            <div>
              <label>Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cashier@pos.local"
                autoFocus
              />
            </div>
            <div>
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loginOnline()}
              />
            </div>
            <button className="primary lg" disabled={busy} onClick={loginOnline}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </div>
        ) : (
          <div className="col">
            <div>
              <label>User</label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>PIN</label>
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loginOffline()}
              />
            </div>
            <button className="primary lg" disabled={busy} onClick={loginOffline}>
              Unlock
            </button>
          </div>
        )}

        {error && (
          <div
            style={{
              marginTop: 14,
              padding: "10px 12px",
              borderRadius: 8,
              background: "rgba(239, 68, 68, 0.12)",
              border: "1px solid rgba(239, 68, 68, 0.35)",
              color: "#fecaca",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
