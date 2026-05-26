import React, { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Badge, Muted, Panel, Row, Title, styles } from "../components/ui";
import { colors } from "../theme";
import { settings, syncQueue } from "../db/repositories";

export default function ConflictsScreen() {
  const [serverConflicts, setServerConflicts] = useState<any[]>([]);
  const [localStats, setLocalStats] = useState<Record<string, number>>({});
  const [backendUrl, setBackendUrl] = useState<string>("");

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const url = (await settings.get<string>("backend_url")) ?? "";
        setBackendUrl(url);
        setLocalStats(await syncQueue.stats());
        if (url) {
          try {
            const res = await fetch(`${url}/admin/sync-conflicts`);
            if (res.ok) {
              const j = await res.json();
              setServerConflicts(j.data?.items ?? []);
            }
          } catch {}
        }
      })();
    }, []),
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollPad}>
      <Title>⚠️ Conflicts</Title>
      <Muted style={{ marginVertical: 6 }}>Backend: {backendUrl || "not configured"}</Muted>

      <Panel style={{ marginTop: 8 }}>
        <Title style={{ fontSize: 16 }}>Local queue</Title>
        {(localStats.conflict ?? 0) === 0 ? (
          <Muted style={{ paddingVertical: 6 }}>No local conflicts.</Muted>
        ) : (
          <Text style={{ color: colors.text, marginTop: 6 }}>
            {localStats.conflict} conflicting event(s) — see Pending tab.
          </Text>
        )}
      </Panel>

      <Panel style={{ marginTop: 12 }}>
        <Title style={{ fontSize: 16 }}>Server conflicts</Title>
        {serverConflicts.length === 0 ? (
          <Muted style={{ paddingVertical: 6 }}>None reported.</Muted>
        ) : (
          serverConflicts.map((c) => (
            <Row
              key={c.id}
              style={{ justifyContent: "space-between", paddingVertical: 8, borderBottomColor: colors.border, borderBottomWidth: 1 }}
            >
              <View>
                <Text style={{ color: colors.text }}>{c.conflict_type}</Text>
                <Muted>device {c.device_id}</Muted>
              </View>
              <Badge variant="error">{c.severity}</Badge>
            </Row>
          ))
        )}
        <Muted style={{ marginTop: 8 }}>Resolution happens in the admin dashboard.</Muted>
      </Panel>
    </ScrollView>
  );
}
