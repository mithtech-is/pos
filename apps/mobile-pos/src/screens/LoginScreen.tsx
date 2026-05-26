import React, { useEffect, useState } from "react";
import { TouchableOpacity, View, Text as RNText } from "react-native";
import * as Crypto from "expo-crypto";
import {
  Button,
  Card,
  Field,
  LayoutWithScroll,
  StatusPill,
  Text,
  Toast,
  ToastMessage,
  useTheme,
} from "../design";
import { useAuthStore } from "../state/auth";
import { selectOne } from "../db";
import { settings, users } from "../db/repositories";
import { tick } from "../sync";

/**
 * Light-theme login screen. Two modes:
 *   • Online — email + password against the Medusa /pos/auth/login endpoint
 *   • Offline — pick a previously-synced user and unlock with their PIN
 *
 * The mode toggle defaults to "online" but auto-switches to "offline" when
 * there are cached users and no backend has been configured yet.
 */

const DEMO_CREDS = [
  { email: "cashier@pos.local", password: "cashier12345", role: "cashier" },
  { email: "manager@pos.local", password: "manager12345", role: "manager" },
];

export default function LoginScreen() {
  const t = useTheme();
  const setUser = useAuthStore((s) => s.setUser);

  const [mode, setMode] = useState<"online" | "offline">("online");
  const [backendUrl, setBackendUrl] = useState("");
  const [deviceCode, setDeviceCode] = useState("POS001");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [usersList, setUsersList] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    (async () => {
      const savedUrl = await settings.get<string>("backend_url");
      const savedCode = await settings.get<string>("device_code");
      setBackendUrl(savedUrl ?? "http://localhost:9000");
      setDeviceCode(savedCode ?? "POS001");
      const list = await users.list();
      setUsersList(list);
      if (list.length) setSelectedUserId(list[0].id);
    })().catch(() => {});
  }, []);

  async function loginOnline() {
    setError(null);
    setBusy(true);
    // Bound the fetch so a wrong IP / blocked port doesn't make the form
    // hang for 5+ minutes. 10s is generous for a LAN call.
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 10_000);
    try {
      await settings.set("backend_url", backendUrl);
      await settings.set("device_code", deviceCode);
      const res = await fetch(`${backendUrl}/pos/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, device_code: deviceCode }),
        signal: ctrl.signal,
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.success === false) {
        throw new Error(payload?.error?.message ?? `HTTP ${res.status}`);
      }
      const data = payload.data ?? payload;
      await settings.set("access_token", data.access_token);
      await users.upsert({
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        role: data.user.role,
        offline_access_expires_at: data.user.offline_access_expires_at,
        pin_hash: data.offline_pin_hash,
      });
      setUser({
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        role: data.user.role,
      });
      void tick();
    } catch (err) {
      const msg = (err as Error).message;
      // AbortError = our own timeout. Surface a friendlier message.
      if (msg.includes("Abort") || msg.includes("abort")) {
        setError(
          `Can't reach ${backendUrl}. Check the IP, that the backend is running, and that your PC firewall lets the phone in.`,
        );
      } else if (msg.includes("Network request failed")) {
        setError(
          `Network unreachable. The phone can't see ${backendUrl}. Often a firewall or wrong IP.`,
        );
      } else {
        setError(msg);
      }
    } finally {
      clearTimeout(timeoutId);
      setBusy(false);
    }
  }

  async function loginOffline() {
    setError(null);
    setBusy(true);
    try {
      if (!selectedUserId) throw new Error("Pick a user");
      const u = usersList.find((x) => x.id === selectedUserId);
      if (!u) throw new Error("User not found");
      const full = await selectOne<any>(
        "SELECT * FROM local_users WHERE id = ?",
        [selectedUserId],
      );
      if (!full?.pin_hash) throw new Error("No PIN registered for this user");
      const [scheme, salt, digest] = String(full.pin_hash).split("$");
      if (scheme !== "sha256" || !salt || !digest) {
        throw new Error("Stored PIN hash is malformed");
      }
      const candidate = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        salt + pin,
        { encoding: Crypto.CryptoEncoding.HEX },
      );
      if (candidate.toLowerCase() !== digest.toLowerCase()) {
        throw new Error("Wrong PIN");
      }
      setUser({ id: u.id, name: u.name, email: u.email, role: u.role });
    } catch (err) {
      setError(`Offline unlock failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  function useDemo(c: (typeof DEMO_CREDS)[number]) {
    setEmail(c.email);
    setPassword(c.password);
    setError(null);
    setToast({ id: String(Date.now()), kind: "info", text: `Loaded ${c.role} demo creds` });
  }

  return (
    <LayoutWithScroll edges={["top", "bottom"]} contentStyle={{ paddingTop: 32 }}>
      <View style={{ marginBottom: 20 }}>
        <StatusPill tone="active" size="sm">
          ⚡ Offline-first POS
        </StatusPill>
        <Text variant="display" style={{ marginTop: 12, marginBottom: 6 }}>
          School Uniform POS
        </Text>
        <Text variant="body" tone="soft">
          Sell uniforms across multiple schools — even when the network drops.
          Orders queue locally and sync automatically when you're back online.
        </Text>
      </View>

      <Card elev={1}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button
            variant={mode === "online" ? "primary" : "outline"}
            size="md"
            onPress={() => setMode("online")}
            style={{ flex: 1 }}
          >
            Online sign-in
          </Button>
          <Button
            variant={mode === "offline" ? "primary" : "outline"}
            size="md"
            disabled={usersList.length === 0}
            onPress={() => setMode("offline")}
            style={{ flex: 1 }}
          >
            Offline PIN
          </Button>
        </View>

        <View style={{ height: 16 }} />

        {mode === "online" ? (
          <View style={{ gap: 12 }}>
            <Field
              label="Backend URL"
              value={backendUrl}
              onChangeText={setBackendUrl}
              autoCapitalize="none"
            />
            <Field
              label="Device code"
              value={deviceCode}
              onChangeText={setDeviceCode}
              autoCapitalize="characters"
            />
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              onSubmitEditing={loginOnline}
            />
            <Button variant="primary" size="lg" onPress={loginOnline} loading={busy} full>
              Sign in
            </Button>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <Text variant="label" tone="muted">
              USER
            </Text>
            <View style={{ gap: 6 }}>
              {usersList.map((u) => {
                const active = selectedUserId === u.id;
                return (
                  <TouchableOpacity
                    key={u.id}
                    onPress={() => setSelectedUserId(u.id)}
                    activeOpacity={0.7}
                    style={{
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      borderRadius: t.radius.md,
                      borderWidth: 1,
                      borderColor: active ? t.colors.primary : t.colors.border,
                      backgroundColor: active ? t.colors.primarySoft : t.colors.surface,
                    }}
                  >
                    <Text variant="body">{u.name}</Text>
                    <Text variant="caption" tone="muted">
                      {u.email} · {u.role}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Field
              label="PIN"
              value={pin}
              onChangeText={setPin}
              secureTextEntry
              keyboardType="number-pad"
              onSubmitEditing={loginOffline}
            />
            <Button variant="primary" size="lg" onPress={loginOffline} loading={busy} full>
              Unlock
            </Button>
          </View>
        )}

        {error && (
          <View
            style={{
              marginTop: 12,
              padding: 12,
              borderRadius: t.radius.md,
              backgroundColor: t.colors.errorBg,
            }}
          >
            <RNText style={{ color: t.colors.errorFg, fontSize: 13, fontWeight: "500" }}>
              {error}
            </RNText>
          </View>
        )}
      </Card>

      <View style={{ height: 16 }} />

      <Card>
        <Text variant="bodyStrong">Demo credentials</Text>
        <Text variant="caption" tone="muted" style={{ marginTop: 2, marginBottom: 10 }}>
          Tap one to autofill the online form.
        </Text>
        <View style={{ gap: 6 }}>
          {DEMO_CREDS.map((c) => (
            <TouchableOpacity
              key={c.email}
              onPress={() => useDemo(c)}
              activeOpacity={0.7}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                padding: 10,
                borderRadius: t.radius.md,
                borderWidth: 1,
                borderColor: t.colors.border,
              }}
            >
              <View>
                <Text variant="mono">{c.email}</Text>
                <Text variant="mono" tone="muted">
                  {c.password}
                </Text>
              </View>
              <StatusPill tone={c.role === "manager" ? "active" : "neutral"} size="sm">
                {c.role}
              </StatusPill>
            </TouchableOpacity>
          ))}
        </View>
        <Text variant="caption" tone="muted" style={{ marginTop: 10 }}>
          Manager PIN for discount/return approvals: 9999
        </Text>
      </Card>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </LayoutWithScroll>
  );
}
