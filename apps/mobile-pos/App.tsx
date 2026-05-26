import "react-native-gesture-handler";
import React, { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ThemeProvider, useTheme } from "./src/design";
import { openDb } from "./src/db";
import { startSyncWorker, stopSyncWorker } from "./src/sync";
import { useAuthStore } from "./src/state/auth";

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

  // Start sync worker once authenticated; stop on logout.
  useEffect(() => {
    if (user) {
      startSyncWorker();
      return () => stopSyncWorker();
    }
  }, [user]);

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
