import React, { useCallback, useState } from "react";
import { ScrollView, View, Text } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Badge, Button, Muted, Panel, Row, Title, inr, styles } from "../components/ui";
import { colors } from "../theme";
import { orders as ordersRepo } from "../db/repositories";
import { tick } from "../sync";

export default function PendingOrdersScreen() {
  const [list, setList] = useState<any[]>([]);

  async function refresh() {
    const all = await ordersRepo.list({ limit: 500 });
    setList(all.filter((o) => o.sync_status === "pending" || o.sync_status === "failed"));
  }

  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => {});
      const h = setInterval(refresh, 4000);
      return () => clearInterval(h);
    }, []),
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollPad}>
      <Row style={{ justifyContent: "space-between" }}>
        <Title>⏳ Pending</Title>
        <Button
          variant="primary"
          onPress={async () => {
            await tick();
            await refresh();
          }}
        >
          Sync now
        </Button>
      </Row>
      <Muted style={{ marginTop: 6, marginBottom: 12 }}>
        Orders queued for sync. Will drain automatically when online.
      </Muted>
      {list.length === 0 ? (
        <Panel>
          <Muted style={{ textAlign: "center", paddingVertical: 16 }}>
            Nothing pending. Everything is synced.
          </Muted>
        </Panel>
      ) : (
        list.map((o) => (
          <Panel key={o.id} style={{ marginBottom: 8 }}>
            <Row style={{ justifyContent: "space-between" }}>
              <View>
                <Text style={{ color: colors.text, fontWeight: "600" }}>
                  {o.local_order_number}
                </Text>
                <Muted>{(o.created_at ?? "").slice(0, 16).replace("T", " ")}</Muted>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: colors.text, fontWeight: "700" }}>
                  {inr(Number(o.grand_total ?? 0))}
                </Text>
                <Badge variant={o.sync_status === "failed" ? "error" : "offline"}>
                  {o.sync_status}
                </Badge>
              </View>
            </Row>
          </Panel>
        ))
      )}
    </ScrollView>
  );
}
