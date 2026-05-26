import { useEffect, useState } from "react";
import { useThemeStore, type ThemePreference } from "../state/theme";
import { useAuthStore } from "../state/auth";

/**
 * Settings — broker / dealer terminal configuration.
 *
 * Underlying storage keys are unchanged (distributor_name, distributor_address,
 * etc.) so the existing sync + receipt code continues to work; only the
 * labels and copy are rebranded to Polemarch / unlisted-shares context. SEBI
 * registration is a new optional field stored under its own key.
 */
export default function SettingsPage() {
  const themePref = useThemeStore((s) => s.preference);
  const setThemePref = useThemeStore((s) => s.setPreference);
  const { user, logout } = useAuthStore();
  const [backendUrl, setBackendUrl] = useState("");
  const [deviceCode, setDeviceCode] = useState("");
  const [deviceToken, setDeviceToken] = useState("");
  const [brokerName, setBrokerName] = useState("");
  const [brokerAddress, setBrokerAddress] = useState("");
  const [brokerGstin, setBrokerGstin] = useState("");
  const [sebiReg, setSebiReg] = useState("");
  const [bankUpiVpa, setBankUpiVpa] = useState("");
  const [bankPayee, setBankPayee] = useState("");
  const [bankNeftAccount, setBankNeftAccount] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      setBackendUrl(((await window.pos.getSetting("backend_url")) as string) ?? "http://localhost:9000");
      setDeviceCode(((await window.pos.getSetting("device_code")) as string) ?? "POS001");
      setDeviceToken(((await window.pos.getSetting("device_token")) as string) ?? "");
      setBrokerName(
        ((await window.pos.getSetting("distributor_name")) as string) ??
          "Polemarch Securities Pvt Ltd",
      );
      setBrokerAddress(
        ((await window.pos.getSetting("distributor_address")) as string) ??
          "BKC, Bandra East, Mumbai 400051",
      );
      setBrokerGstin(((await window.pos.getSetting("distributor_gstin")) as string) ?? "");
      setSebiReg(((await window.pos.getSetting("sebi_registration")) as string) ?? "");
      setBankUpiVpa(((await window.pos.getSetting("upi_vpa")) as string) ?? "");
      setBankPayee(
        ((await window.pos.getSetting("upi_payee_name")) as string) ?? "Polemarch Securities",
      );
      setBankNeftAccount(((await window.pos.getSetting("neft_account")) as string) ?? "");
      setBankIfsc(((await window.pos.getSetting("neft_ifsc")) as string) ?? "");
      setAllowNegativeStock(
        ((await window.pos.getSetting("allow_negative_stock")) as boolean) ?? false,
      );
    })().catch(() => {});
  }, []);

  async function save() {
    await window.pos.setBackendUrl(backendUrl);
    await window.pos.setDeviceCode(deviceCode);
    await window.pos.setDeviceToken(deviceToken);
    await window.pos.setSetting({ key: "distributor_name", value: brokerName });
    await window.pos.setSetting({ key: "distributor_address", value: brokerAddress });
    await window.pos.setSetting({ key: "distributor_gstin", value: brokerGstin });
    await window.pos.setSetting({ key: "sebi_registration", value: sebiReg });
    await window.pos.setSetting({ key: "upi_vpa", value: bankUpiVpa });
    await window.pos.setSetting({ key: "upi_payee_name", value: bankPayee });
    await window.pos.setSetting({ key: "neft_account", value: bankNeftAccount });
    await window.pos.setSetting({ key: "neft_ifsc", value: bankIfsc });
    await window.pos.setSetting({
      key: "allow_negative_stock",
      value: allowNegativeStock,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div
      style={{
        padding: 16,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 16,
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      <div className="panel elev" style={{ gridColumn: "1 / -1" }}>
        <h2 style={{ marginTop: 0 }}>🎨 Appearance</h2>
        <div className="muted" style={{ marginBottom: 12 }}>
          "System" follows your OS color scheme and switches automatically
          when day/night mode kicks in.
        </div>
        <div className="row" style={{ gap: 8 }}>
          {(["light", "dark", "system"] as ThemePreference[]).map((opt) => (
            <button
              key={opt}
              className={themePref === opt ? "primary" : "outline"}
              style={{ flex: 1, justifyContent: "center", textTransform: "capitalize" }}
              onClick={() => void setThemePref(opt)}
            >
              {opt === "light" ? "☀️ Light" : opt === "dark" ? "🌙 Dark" : "🌓 System"}
            </button>
          ))}
        </div>
      </div>

      <div className="panel elev">
        <h2 style={{ marginTop: 0 }}>🔌 Connection</h2>
        <div className="col">
          <div>
            <label>Backend URL</label>
            <input value={backendUrl} onChange={(e) => setBackendUrl(e.target.value)} />
          </div>
          <div>
            <label>Terminal code</label>
            <input value={deviceCode} onChange={(e) => setDeviceCode(e.target.value)} />
            <div className="muted">Unique ID for this trading terminal.</div>
          </div>
          <div>
            <label>Terminal registration token</label>
            <input value={deviceToken} onChange={(e) => setDeviceToken(e.target.value)} />
            <div className="muted">Returned by POST /pos/device/register.</div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, textTransform: "none" }}>
            <input
              type="checkbox"
              checked={allowNegativeStock}
              onChange={(e) => setAllowNegativeStock(e.target.checked)}
              style={{ width: "auto" }}
            />
            Allow trade even when book inventory is insufficient (short sell)
          </label>
        </div>
      </div>

      <div className="panel elev">
        <h2 style={{ marginTop: 0 }}>🏢 Broker identity</h2>
        <div className="col">
          <div>
            <label>Broker name</label>
            <input value={brokerName} onChange={(e) => setBrokerName(e.target.value)} />
          </div>
          <div>
            <label>Registered office</label>
            <textarea
              rows={2}
              value={brokerAddress}
              onChange={(e) => setBrokerAddress(e.target.value)}
            />
          </div>
          <div className="row">
            <div className="flex-1">
              <label>GSTIN</label>
              <input
                value={brokerGstin}
                onChange={(e) => setBrokerGstin(e.target.value)}
                placeholder="27AAAAA0000A1Z5"
              />
            </div>
            <div className="flex-1">
              <label>SEBI Reg #</label>
              <input
                value={sebiReg}
                onChange={(e) => setSebiReg(e.target.value)}
                placeholder="INZ000123456"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="panel elev" style={{ gridColumn: "1 / -1" }}>
        <h2 style={{ marginTop: 0 }}>💸 Settlement instructions</h2>
        <div className="muted" style={{ marginBottom: 12 }}>
          Used on contract notes + the UPI QR shown to clients at checkout.
          These details are read-only for the dealer — only Compliance can
          change them here.
        </div>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div className="flex-1">
            <label>Merchant UPI VPA</label>
            <input
              value={bankUpiVpa}
              onChange={(e) => setBankUpiVpa(e.target.value)}
              placeholder="polemarch@hdfcbank"
            />
            <div className="muted">For instant client payments. Test with a small trade first.</div>
          </div>
          <div className="flex-1">
            <label>Payee name (shown in client's UPI app)</label>
            <input
              value={bankPayee}
              onChange={(e) => setBankPayee(e.target.value)}
              placeholder="Polemarch Securities"
            />
          </div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <div className="flex-1">
            <label>Bank account # (for NEFT / RTGS)</label>
            <input
              value={bankNeftAccount}
              onChange={(e) => setBankNeftAccount(e.target.value)}
              placeholder="50100123456789"
            />
          </div>
          <div className="flex-1">
            <label>IFSC</label>
            <input
              value={bankIfsc}
              onChange={(e) => setBankIfsc(e.target.value)}
              placeholder="HDFC0000123"
            />
          </div>
        </div>
      </div>

      <div
        style={{
          gridColumn: "1 / -1",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <div>
          {saved && <span className="badge online">✓ Saved</span>}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="danger lg" onClick={logout}>
            Sign out{user ? ` · ${user.name}` : ""}
          </button>
          <button className="primary lg" onClick={save}>
            Save settings
          </button>
        </div>
      </div>
    </div>
  );
}
