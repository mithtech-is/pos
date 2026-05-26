import React, { useEffect, useState } from "react";
import { TouchableOpacity, View, Text as RNText } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../design";
import { syncQueue } from "../db/repositories";
import { getSyncState, onSyncState } from "../sync";

/**
 * Slim top bar shared by tab screens.
 *
 *   ≡   <title>             • Online · 3 pending
 *
 * Left: hamburger that toggles the parent drawer.
 * Center: page title (caller-supplied).
 * Right: connectivity dot + pending-sync count, live-updating from the sync
 *        worker's state + `syncQueue.stats()`.
 */
export const TopBar: React.FC<{ title: string }> = ({ title }) => {
  const t = useTheme();
  const nav = useNavigation<any>();
  const [state, setState] = useState(getSyncState());
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const unsub = onSyncState(setState);
    const refresh = async () => {
      try {
        const s = await syncQueue.stats();
        setPending(s.pending + s.failed);
      } catch {
        /* ignore */
      }
    };
    refresh();
    const h = setInterval(refresh, 3000);
    return () => {
      unsub();
      clearInterval(h);
    };
  }, []);

  const tone = state.online
    ? t.colors.successFg
    : pending > 0
      ? t.colors.warningFg
      : t.colors.muted;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 4,
        paddingTop: 4,
        paddingBottom: 4,
        gap: 6,
      }}
    >
      <TouchableOpacity
        onPress={() => nav.getParent()?.navigate("More")}
        hitSlop={10}
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <RNText style={{ color: t.colors.text, fontSize: 22, fontWeight: "600" }}>≡</RNText>
      </TouchableOpacity>
      <RNText
        style={{
          flex: 1,
          color: t.colors.text,
          fontSize: 16,
          fontWeight: "600",
        }}
        numberOfLines={1}
      >
        {title}
      </RNText>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 10,
          paddingVertical: 4,
        }}
      >
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: tone,
          }}
        />
        <RNText style={{ color: t.colors.muted, fontSize: 12 }}>
          {state.online ? "Online" : "Offline"}
          {pending > 0 ? ` · ${pending}` : ""}
        </RNText>
      </View>
    </View>
  );
};
