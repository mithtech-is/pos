import React, { useEffect, useState } from "react";
import { Switch, TouchableOpacity, View, Text as RNText } from "react-native";
import {
  Button,
  Card,
  Field,
  Layout,
  LayoutWithScroll,
  Prompt,
  StatusPill,
  Text,
  Toast,
  ToastMessage,
  useTheme,
  type ThemePreference,
} from "../design";
import { TopBar } from "../navigation/TopBar";
import { settings } from "../db/repositories";
import { useAuthStore } from "../state/auth";

/**
 * Settings — light, sectioned screen.
 *
 *   • Theme (light / dark / system)
 *   • Connection (backend URL, device code, device token, allow negative stock)
 *   • Receipt branding (distributor name/address/GSTIN)
 *   • UPI (VPA, payee name)
 *   • Account (current user + Sign out)
 *
 * All values persist via the existing SQLite `settings` repo so they survive
 * cold starts and never need the network.
 */
export default function SettingsScreen() {
  const t = useTheme();
  const { logout, user } = useAuthStore();

  const [backendUrl, setBackendUrl] = useState("");
  const [deviceCode, setDeviceCode] = useState("");
  const [deviceToken, setDeviceToken] = useState("");
  const [distName, setDistName] = useState("");
  const [distAddress, setDistAddress] = useState("");
  const [distGstin, setDistGstin] = useState("");
  const [upiVpa, setUpiVpa] = useState("");
  const [upiPayee, setUpiPayee] = useState("");
  const [allowNegative, setAllowNegative] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    (async () => {
      setBackendUrl((await settings.get<string>("backend_url")) ?? "http://localhost:9000");
      setDeviceCode((await settings.get<string>("device_code")) ?? "POS001");
      setDeviceToken((await settings.get<string>("device_token")) ?? "");
      setDistName(
        (await settings.get<string>("distributor_name")) ?? "Trail Blaze Retail Pvt Ltd",
      );
      setDistAddress(
        (await settings.get<string>("distributor_address")) ??
          "#30/1 Surveyor Street, DVG Road, Basavanagudi, Bangalore 560004",
      );
      setDistGstin((await settings.get<string>("distributor_gstin")) ?? "");
      setUpiVpa((await settings.get<string>("upi_vpa")) ?? "");
      setUpiPayee((await settings.get<string>("upi_payee_name")) ?? "Trail Blaze Retail");
      setAllowNegative((await settings.get<boolean>("allow_negative_stock")) === true);
    })().catch(() => {});
  }, []);

  async function save() {
    await settings.set("backend_url", backendUrl);
    await settings.set("device_code", deviceCode);
    await settings.set("device_token", deviceToken);
    await settings.set("distributor_name", distName);
    await settings.set("distributor_address", distAddress);
    await settings.set("distributor_gstin", distGstin);
    await settings.set("upi_vpa", upiVpa);
    await settings.set("upi_payee_name", upiPayee);
    await settings.set("allow_negative_stock", allowNegative);
    setToast({ id: String(Date.now()), kind: "success", text: "Settings saved" });
  }

  return (
    <Layout edges={["top"]} padded={false}>
      <View style={{ paddingHorizontal: t.spacing["4"] }}>
        <TopBar title="Settings" />
      </View>
      <LayoutWithScroll padded edges={[]}>
        <View style={{ paddingTop: 4, paddingBottom: 16 }}>
          <Text variant="title">Settings</Text>
        </View>

        {/* ───── Account ───── */}
        {user && (
          <Section title="Account">
            <Card>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{user.name}</Text>
                  <Text variant="caption" tone="muted">
                    {user.email}
                  </Text>
                  <View style={{ marginTop: 6 }}>
                    <StatusPill tone={user.role === "manager" ? "active" : "neutral"} size="sm">
                      {user.role}
                    </StatusPill>
                  </View>
                </View>
              </View>
            </Card>
          </Section>
        )}

        {/* ───── Theme ───── */}
        <Section title="Appearance">
          <Card>
            <Text variant="bodyStrong" style={{ marginBottom: 10 }}>
              Theme
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["light", "dark", "system"] as ThemePreference[]).map((opt) => {
                const active = t.preference === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => t.setPreference(opt)}
                    activeOpacity={0.7}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: t.radius.md,
                      borderWidth: 1,
                      borderColor: active ? t.colors.primary : t.colors.border,
                      backgroundColor: active ? t.colors.primary : t.colors.surface,
                      alignItems: "center",
                    }}
                  >
                    <RNText
                      style={{
                        color: active ? t.colors.primaryFg : t.colors.text,
                        fontWeight: "500",
                        textTransform: "capitalize",
                      }}
                    >
                      {opt === "system" ? "🌓 System" : opt === "dark" ? "🌙 Dark" : "☀️ Light"}
                    </RNText>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text variant="caption" tone="muted" style={{ marginTop: 8 }}>
              Current: {t.mode === "dark" ? "Dark" : "Light"}
            </Text>
          </Card>
        </Section>

        {/* ───── Connection ───── */}
        <Section title="Connection">
          <Card>
            <View style={{ gap: 12 }}>
              <Field
                label="Backend URL"
                value={backendUrl}
                onChangeText={setBackendUrl}
                autoCapitalize="none"
                placeholder="http://192.168.1.10:9000"
              />
              <Field
                label="Device code"
                value={deviceCode}
                onChangeText={setDeviceCode}
                autoCapitalize="characters"
                placeholder="POS001"
              />
              <Field
                label="Device registration token"
                value={deviceToken}
                onChangeText={setDeviceToken}
                helper="From POST /pos/device/register"
              />
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingTop: 4,
                }}
              >
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text variant="body">Allow sale on insufficient stock</Text>
                  <Text variant="caption" tone="muted">
                    Use only if your admin policy permits negative stock.
                  </Text>
                </View>
                <Switch
                  value={allowNegative}
                  onValueChange={setAllowNegative}
                  trackColor={{ false: t.colors.borderStrong, true: t.colors.primary }}
                  thumbColor={t.colors.surface}
                />
              </View>
            </View>
          </Card>
        </Section>

        {/* ───── Receipt branding ───── */}
        <Section title="Receipt branding">
          <Card>
            <View style={{ gap: 12 }}>
              <Field label="Distributor name" value={distName} onChangeText={setDistName} />
              <Field
                label="Address"
                value={distAddress}
                onChangeText={setDistAddress}
                multiline
                numberOfLines={2}
              />
              <Field
                label="GSTIN (optional)"
                value={distGstin}
                onChangeText={setDistGstin}
                placeholder="29AAAAA0000A1Z5"
              />
            </View>
          </Card>
        </Section>

        {/* ───── UPI ───── */}
        <Section title="UPI payments">
          <Card>
            <Text variant="caption" tone="muted" style={{ marginBottom: 10 }}>
              Used when the cashier picks UPI at checkout. We render a BHIM QR
              with these details pre-filled.
            </Text>
            <View style={{ gap: 12 }}>
              <Field
                label="Merchant UPI VPA"
                value={upiVpa}
                onChangeText={setUpiVpa}
                autoCapitalize="none"
                placeholder="trailblaze@hdfcbank"
              />
              <Field
                label="Payee name (shown in parent's UPI app)"
                value={upiPayee}
                onChangeText={setUpiPayee}
              />
            </View>
          </Card>
        </Section>

        {/* ───── Save + Sign out ───── */}
        <View style={{ marginTop: 8 }}>
          <Button variant="primary" size="lg" onPress={save} full>
            Save settings
          </Button>
          <View style={{ height: 16 }} />
          <Button
            variant="outline"
            size="lg"
            onPress={() => setConfirmLogout(true)}
            full
          >
            Sign out
          </Button>
          <Text variant="caption" tone="muted" align="center" style={{ marginTop: 8 }}>
            You will be signed out of your account.
          </Text>
        </View>
      </LayoutWithScroll>

      <Prompt
        visible={confirmLogout}
        title="Sign out?"
        message="You will need to enter your email/password (or PIN) to sign back in."
        confirmLabel="Sign out"
        danger
        onConfirm={() => {
          setConfirmLogout(false);
          logout();
        }}
        onCancel={() => setConfirmLogout(false)}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Layout>
  );
}

/* ── Section header + content slot ── */
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => {
  return (
    <View style={{ marginBottom: 18 }}>
      <Text variant="label" tone="muted" style={{ marginBottom: 8, marginLeft: 4 }}>
        {title.toUpperCase()}
      </Text>
      {children}
    </View>
  );
};
