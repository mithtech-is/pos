import "react-native-gesture-handler";
import React, { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Linking, Text, TouchableOpacity, View } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ThemeProvider, useTheme } from "./src/design";
import { openDb } from "./src/db";
import { startSyncWorker, stopSyncWorker } from "./src/sync";
import { useAuthStore } from "./src/state/auth";
import { parseSsoUrl, signInWithSso } from "./src/state/sso";

import LoginScreen from "./src/screens/LoginScreen";
import { AppRoot } from "./src/navigation/AppRoot";

const Stack = createNativeStackNavigator();

/**
 * Theme-aware NavigationContainer wrapper — pulls colours from the live
 * ThemeProvider so RN-Navigation's default background/text/border match
 * whichever theme the user picked.
 */
function ThemedNavContainer({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const navTheme = {
    ...DefaultTheme,
    dark: t.mode === "dark",
    colors: {
      ...DefaultTheme.colors,
      background: t.colors.bg,
      card: t.colors.surface,
      text: t.colors.text,
      border: t.colors.border,
      primary: t.colors.primary,
      notification: t.colors.errorFg,
    },
  };
  return <NavigationContainer theme={navTheme}>{children}</NavigationContainer>;
}

function AppShell() {
  const user = useAuthStore((s) => s.user);
  const t = useTheme();
  const [ssoBusy, setSsoBusy] = useState(false);
  const [ssoError, setSsoError] = useState<string | null>(null);

  // Start sync worker once authenticated; stop on logout.
  useEffect(() => {
    if (user) {
      startSyncWorker();
      return () => stopSyncWorker();
    }
  }, [user]);

  // Handle inbound SSO deep links from the FieldSales app
  // (schooluniformpos://sso?token=...). Fires on cold start (getInitialURL)
  // and while the app is already open (the "url" event). On success the auth
  // gate flips to AppRoot automatically once signInWithSso sets the user.
  useEffect(() => {
    let cancelled = false;
    async function handleUrl(url: string | null) {
      const params = url ? parseSsoUrl(url) : null;
      if (!params) return;
      setSsoError(null);
      setSsoBusy(true);
      try {
        await signInWithSso(params);
      } catch (err) {
        if (!cancelled) {
          setSsoError((err as Error).message || "Couldn't sign you in.");
        }
      } finally {
        if (!cancelled) setSsoBusy(false);
      }
    }
    Linking.getInitialURL()
      .then((url) => handleUrl(url))
      .catch(() => {});
    const sub = Linking.addEventListener("url", (e) => {
      void handleUrl(e.url);
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return (
    <ThemedNavContainer>
      <StatusBar style={t.mode === "dark" ? "light" : "dark"} />
      {user ? (
        <AppRoot />
      ) : (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Login" component={LoginScreen} />
        </Stack.Navigator>
      )}
      {ssoBusy ? (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: t.colors.bg,
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
          }}
        >
          <ActivityIndicator size="large" color={t.colors.primary} />
          <Text style={{ color: t.colors.text, fontSize: 16, fontWeight: "600" }}>
            Signing you in…
          </Text>
          <Text style={{ color: t.colors.muted, fontSize: 13 }}>
            via RoutePilot
          </Text>
        </View>
      ) : null}
      {ssoError ? (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: t.colors.bg,
            alignItems: "center",
            justifyContent: "center",
            padding: 28,
            gap: 12,
          }}
        >
          <Text style={{ color: t.colors.text, fontSize: 17, fontWeight: "700" }}>
            Single sign-on failed
          </Text>
          <Text
            style={{
              color: t.colors.muted,
              fontSize: 14,
              textAlign: "center",
            }}
          >
            {ssoError}
          </Text>
          <TouchableOpacity
            onPress={() => setSsoError(null)}
            activeOpacity={0.8}
            style={{
              marginTop: 6,
              paddingVertical: 12,
              paddingHorizontal: 22,
              borderRadius: t.radius.md,
              backgroundColor: t.colors.primary,
            }}
          >
            <Text style={{ color: "#ffffff", fontWeight: "600" }}>
              Continue to sign in
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </ThemedNavContainer>
  );
}

export default function App() {
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    (async () => {
      await openDb();
      setDbReady(true);
    })().catch((e) => console.warn("DB init failed:", e));
  }, []);

  if (!dbReady) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#ffffff",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color="#282828" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppShell />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
