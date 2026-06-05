import { useEffect, useState } from "react";
import { useThemeStore, type ThemePreference } from "../state/theme";
import { useAuthStore } from "../state/auth";

/** Settings for terminal, account, payments, appearance, and local data. */
export default function SettingsPage() {
  const themePref = useThemeStore((s) => s.preference);
  const setThemePref = useThemeStore((s) => s.setPreference);
  const { user, logout } = useAuthStore();
  const [backendUrl, setBackendUrl] = useState("");
  const [deviceCode, setDeviceCode] = useState("");
  const [deviceToken, setDeviceToken] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessGstin, setBusinessGstin] = useState("");
  const [sebiReg, setSebiReg] = useState("");
  const [bankUpiVpa, setBankUpiVpa] = useState("");
  const [bankPayee, setBankPayee] = useState("");
  const [bankNeftAccount, setBankNeftAccount] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [gstRate, setGstRate] = useState("0");
  const [priceIncludesTax, setPriceIncludesTax] = useState(false);
  const [hsnCode, setHsnCode] = useState("");
  const [loyaltyRate, setLoyaltyRate] = useState("100");
  const [marginPct, setMarginPct] = useState("40");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      setBackendUrl(((await window.pos.getSetting("backend_url")) as string) ?? "http://localhost:9000");
      setDeviceCode(((await window.pos.getSetting("device_code")) as string) ?? "POS001");
      setDeviceToken(((await window.pos.getSetting("device_token")) as string) ?? "");
      setBusinessName(
        ((await window.pos.getSetting("distributor_name")) as string) ??
          "CounterFlow Store",
      );
      setBusinessAddress(
        ((await window.pos.getSetting("distributor_address")) as string) ??
          "Main branch",
      );
      setBusinessGstin(((await window.pos.getSetting("distributor_gstin")) as string) ?? "");
      setSebiReg(((await window.pos.getSetting("sebi_registration")) as string) ?? "");
      setBankUpiVpa(((await window.pos.getSetting("upi_vpa")) as string) ?? "");
      setBankPayee(
        ((await window.pos.getSetting("upi_payee_name")) as string) ?? "CounterFlow Store",
      );
      setBankNeftAccount(((await window.pos.getSetting("neft_account")) as string) ?? "");
      setBankIfsc(((await window.pos.getSetting("neft_ifsc")) as string) ?? "");
      setAllowNegativeStock(
        ((await window.pos.getSetting("allow_negative_stock")) as boolean) ?? false,
      );
      setGstRate(String(((await window.pos.getSetting("gst_rate")) as number) ?? 0));
      setPriceIncludesTax(
        ((await window.pos.getSetting("price_includes_tax")) as boolean) ?? false,
      );
      setHsnCode(((await window.pos.getSetting("hsn_code")) as string) ?? "");
      setLoyaltyRate(
        String(((await window.pos.getSetting("loyalty_rupees_per_point")) as number) ?? 100),
      );
      setMarginPct(String(((await window.pos.getSetting("assumed_margin_pct")) as number) ?? 40));
    })().catch(() => {});
  }, []);

  async function save() {
    await window.pos.setBackendUrl(backendUrl);
    await window.pos.setDeviceCode(deviceCode);
    await window.pos.setDeviceToken(deviceToken);
    await window.pos.setSetting({ key: "distributor_name", value: businessName });
    await window.pos.setSetting({ key: "distributor_address", value: businessAddress });
    await window.pos.setSetting({ key: "distributor_gstin", value: businessGstin });
    await window.pos.setSetting({ key: "sebi_registration", value: sebiReg });
    await window.pos.setSetting({ key: "upi_vpa", value: bankUpiVpa });
    await window.pos.setSetting({ key: "upi_payee_name", value: bankPayee });
    await window.pos.setSetting({ key: "neft_account", value: bankNeftAccount });
    await window.pos.setSetting({ key: "neft_ifsc", value: bankIfsc });
    await window.pos.setSetting({
      key: "allow_negative_stock",
      value: allowNegativeStock,
    });
    await window.pos.setSetting({ key: "gst_rate", value: Math.max(0, Number(gstRate) || 0) });
    await window.pos.setSetting({ key: "price_includes_tax", value: priceIncludesTax });
    await window.pos.setSetting({ key: "hsn_code", value: hsnCode });
    await window.pos.setSetting({
      key: "loyalty_rupees_per_point",
      value: Math.max(1, Number(loyaltyRate) || 100),
    });
    await window.pos.setSetting({
      key: "assumed_margin_pct",
      value: Math.max(0, Math.min(100, Number(marginPct) || 0)),
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
            <div className="muted">Unique ID for this POS terminal.</div>
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
            Allow checkout even when local inventory is insufficient
          </label>
        </div>
      </div>

      <div className="panel elev">
        <h2 style={{ marginTop: 0 }}>Business identity</h2>
        <div className="col">
          <div>
            <label>Business name</label>
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
          </div>
          <div>
            <label>Address</label>
            <textarea
              rows={2}
              value={businessAddress}
              onChange={(e) => setBusinessAddress(e.target.value)}
            />
          </div>
          <div className="row">
            <div className="flex-1">
              <label>GSTIN</label>
              <input
                value={businessGstin}
                onChange={(e) => setBusinessGstin(e.target.value)}
                placeholder="27AAAAA0000A1Z5"
              />
            </div>
            <div className="flex-1">
              <label>Registration #</label>
              <input
                value={sebiReg}
                onChange={(e) => setSebiReg(e.target.value)}
                placeholder="REG-001"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="panel elev">
        <h2 style={{ marginTop: 0 }}>Tax / GST</h2>
        <div className="col">
          <div className="row">
            <div className="flex-1">
              <label>GST rate (%)</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={gstRate}
                onChange={(e) => setGstRate(e.target.value)}
                placeholder="18"
              />
              <div className="muted">Split equally into CGST + SGST on the invoice. 0 = no tax.</div>
            </div>
            <div className="flex-1">
              <label>Default HSN / SAC code</label>
              <input value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} placeholder="6109" />
            </div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, textTransform: "none" }}>
            <input
              type="checkbox"
              checked={priceIncludesTax}
              onChange={(e) => setPriceIncludesTax(e.target.checked)}
              style={{ width: "auto" }}
            />
            Prices already include GST (MRP) — tax is backed out of the price
          </label>
        </div>
      </div>

      <div className="panel elev">
        <h2 style={{ marginTop: 0 }}>Loyalty</h2>
        <div className="col">
          <div>
            <label>Earn rate — ₹ spent per point</label>
            <input
              type="number"
              min={1}
              value={loyaltyRate}
              onChange={(e) => setLoyaltyRate(e.target.value)}
              placeholder="100"
            />
            <div className="muted">
              e.g. 100 → 1 point per ₹100 spent. Points redeem at ₹1 each at checkout.
            </div>
          </div>
          <div>
            <label>Assumed gross margin % (Analytics profit estimate)</label>
            <input
              type="number"
              min={0}
              max={100}
              value={marginPct}
              onChange={(e) => setMarginPct(e.target.value)}
              placeholder="40"
            />
            <div className="muted">Used to estimate gross profit on the Analytics page.</div>
          </div>
        </div>
      </div>

      <div className="panel elev" style={{ gridColumn: "1 / -1" }}>
        <h2 style={{ marginTop: 0 }}>Payment instructions</h2>
        <div className="muted" style={{ marginBottom: 12 }}>
          Used on receipts and the UPI QR shown to customers at checkout.
        </div>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div className="flex-1">
            <label>Merchant UPI VPA</label>
            <input
              value={bankUpiVpa}
              onChange={(e) => setBankUpiVpa(e.target.value)}
              placeholder="counterflow@bank"
            />
            <div className="muted">For instant customer payments. Test with a small order first.</div>
          </div>
          <div className="flex-1">
            <label>Payee name (shown in customer's UPI app)</label>
            <input
              value={bankPayee}
              onChange={(e) => setBankPayee(e.target.value)}
              placeholder="CounterFlow Store"
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
