import React from "react";
import { TouchableOpacity, View, Text as RNText, ScrollView } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Layout, Text, useTheme } from "../design";
import { TopBar } from "../navigation/TopBar";
import { useAuthStore } from "../state/auth";

/**
 * "More" screen — a simple list of the less-frequent screens. Replaces the
 * Drawer navigator (which was incompatible with Reanimated 4).
 *
 * Each row is a TouchableOpacity that navigates to the matching stack route.
 * Sign out lives at the bottom.
 */

const LINKS: { name: string; label: string; emoji: string; description: string }[] = [
  { name: "Transactions", label: "Transactions", emoji: "💹", description: "Live sales dashboard" },
  { name: "Returns", label: "Returns", emoji: "↩️", description: "Refund or exchange items" },
  { name: "Bulk", label: "Bulk order", emoji: "📦", description: "Paste CSV -> many orders" },
  { name: "Closing", label: "Cash closing", emoji: "🔐", description: "End-of-day reconciliation" },
  { name: "Pending", label: "Pending sync", emoji: "⏳", description: "Orders waiting to upload" },
  { name: "Sync", label: "Sync status", emoji: "📡", description: "Pull / push state" },
  { name: "Conflicts", label: "Conflicts", emoji: "⚠️", description: "Server-side rejected events" },
];

export default function MoreScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const { user, logout } = useAuthStore();

  return (
    <Layout edges={["top"]} padded>
      <TopBar title="More" />
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <View style={{ paddingTop: 4, paddingBottom: 16 }}>
          <Text variant="title">More</Text>
          {user && (
            <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
              Signed in as {user.name} · {user.role}
            </Text>
          )}
        </View>

        <View style={{ gap: 8 }}>
          {LINKS.map((l) => (
            <TouchableOpacity
              key={l.name}
              onPress={() => nav.navigate(l.name)}
              activeOpacity={0.7}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingVertical: 14,
                paddingHorizontal: 14,
                borderRadius: t.radius.md,
                borderWidth: 1,
                borderColor: t.colors.border,
                backgroundColor: t.colors.surface,
              }}
            >
              <RNText style={{ fontSize: 28 }}>{l.emoji}</RNText>
              <View style={{ flex: 1 }}>
                <Text variant="body">{l.label}</Text>
                <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
                  {l.description}
                </Text>
              </View>
              <RNText style={{ color: t.colors.muted, fontSize: 18 }}>›</RNText>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 24 }} />
        <TouchableOpacity
          onPress={logout}
          activeOpacity={0.7}
          style={{
            paddingVertical: 14,
            paddingHorizontal: 14,
            borderRadius: t.radius.md,
            borderWidth: 1,
            borderColor: t.colors.errorFg,
            backgroundColor: t.colors.errorBg,
            alignItems: "center",
          }}
        >
          <RNText style={{ color: t.colors.errorFg, fontWeight: "700" }}>Sign out</RNText>
        </TouchableOpacity>
      </ScrollView>
    </Layout>
  );
}
