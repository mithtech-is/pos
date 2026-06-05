import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, View, Text } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Badge, Panel, Row, Title, Muted, Stat, Button, inr, styles } from "../components/ui";
import { colors, paymentColor, radius } from "../theme";
import { orders as ordersRepo, masterData } from "../db/repositories";

type Range = "today" | "yesterday" | "7d" | "all";

function rangeBounds(r: Range): { since: Date; until: Date } {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  switch (r) {
    case "today":
      return { since: start, until: now };
    case "yesterday": {
      const y = new Date(start); y.setDate(y.getDate() - 1);
      return { since: y, until: start };
    }
    case "7d": {
      const s = new Date(start); s.setDate(s.getDate() - 6);
      return { since: s, until: now };
    }
    case "all":
      return { since: new Date(0), until: now };
  }
}

const MODE_ICON: Record<string, string> = {
  cash: "💵",
  upi: "📱",
  card: "💳",
  credit: "📒",
};

/**
 * Live transactions dashboard — totals broken down by payment mode, outlet
 * and cashier. Same data shape as the Electron version. Bank-side
 * reconciliation requires a payment gateway (out of MVP).
 */
export default function TransactionsScreen() {
  const [orders, setOrders] = useState<any[]>([]);
  const [outletMap, setOutletMap] = useState<Record<string, string>>({});
  const [range, setRange] = useState<Range>("today");
  const [updatedAt, setUpdatedAt] = useState(new Date());

  async function refresh() {
    const list = await ordersRepo.list({ limit: 1000 });
    setOrders(list);
    const schools = await masterData.listSchools();
    const map: Record<string, string> = {};
    for (const s of schools) map[s.id] = `${s.code} · ${s.name}`;
    setOutletMap(map);
    setUpdatedAt(new Date());
  }

  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => {});
      const h = setInterval(refresh, 4000);
      return () => clearInterval(h);
    }, []),
  );

  const filtered = useMemo(() => {
    const { since, until } = rangeBounds(range);
    return orders.filter((o) => {
      const t = new Date(o.created_at);
      return t >= since && t <= until;
    });
  }, [orders, range]);

  const totalGross = filtered.reduce((s, o) => s + Number(o.grand_total ?? 0), 0);
  const pendingSync = orders.filter((o) => o.sync_status !== "synced").length;

  const byMode = useMemo(() => {
    const m = new Map<string, { mode: string; count: number; gross: number }>();
    for (const o of filtered) {
      const k = o.payment_mode;
      const cur = m.get(k) ?? { mode: k, count: 0, gross: 0 };
      cur.count++; cur.gross += Number(o.grand_total ?? 0);
      m.set(k, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.gross - a.gross);
  }, [filtered]);

  const bySchool = useMemo(() => {
    const m = new Map<string, { school_id: string; count: number; gross: number }>();
    for (const o of filtered) {
      const cur = m.get(o.school_id) ?? { school_id: o.school_id, count: 0, gross: 0 };
      cur.count++; cur.gross += Number(o.grand_total ?? 0);
      m.set(o.school_id, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.gross - a.gross);
  }, [filtered]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollPad}>
      <Row style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <View>
          <Title>💹 Transactions</Title>
          <Muted>Live · refreshed {updatedAt.toLocaleTimeString()}</Muted>
        </View>
      </Row>

      <Row gap={6} style={{ marginBottom: 12 }}>
        {(["today", "yesterday", "7d", "all"] as Range[]).map((r) => (
          <Button
            key={r}
            onPress={() => setRange(r)}
            variant={range === r ? "primary" : "ghost"}
            style={{ flex: 1 }}
          >
            {r === "today" ? "Today" : r === "yesterday" ? "Yest." : r === "7d" ? "7d" : "All"}
          </Button>
        ))}
      </Row>

      <Panel elev style={{ marginBottom: 12 }}>
        <Muted>Gross collected</Muted>
        <Text style={{ color: colors.text, fontSize: 36, fontWeight: "800" }}>
          {inr(totalGross)}
        </Text>
        <Muted>
          {filtered.length} order{filtered.length !== 1 ? "s" : ""}
          {pendingSync > 0 ? ` · ${pendingSync} pending sync` : ""}
        </Muted>
      </Panel>

      <Row gap={8} style={{ marginBottom: 12 }}>
        {byMode.slice(0, 2).map((m) => (
          <Stat
            key={m.mode}
            label={`${MODE_ICON[m.mode] ?? "💰"} ${m.mode}`}
            value={inr(m.gross)}
            hint={`${m.count} orders`}
          />
        ))}
      </Row>

      <Panel style={{ marginBottom: 12 }}>
        <Title style={{ fontSize: 16 }}>By payment mode</Title>
        <View style={{ marginTop: 8 }}>
          {byMode.length === 0 && <Muted>—</Muted>}
          {byMode.map((m) => {
            const pct = totalGross > 0 ? (m.gross / totalGross) * 100 : 0;
            return (
              <View key={m.mode} style={{ marginBottom: 10 }}>
                <Row style={{ justifyContent: "space-between" }}>
                  <Text style={{ color: colors.text }}>
                    {MODE_ICON[m.mode] ?? "💰"} <Text style={{ fontWeight: "600", textTransform: "capitalize" }}>{m.mode}</Text>
                  </Text>
                  <Text style={{ color: colors.text, fontVariant: ["tabular-nums"] }}>
                    {inr(m.gross)} <Text style={{ color: colors.muted, fontSize: 11 }}>{pct.toFixed(0)}%</Text>
                  </Text>
                </Row>
                <View
                  style={{
                    height: 6,
                    backgroundColor: colors.bgElev1,
                    borderRadius: 3,
                    marginTop: 4,
                  }}
                >
                  <View
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      backgroundColor: paymentColor[m.mode] ?? colors.accent,
                      borderRadius: 3,
                    }}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </Panel>

      <Panel style={{ marginBottom: 12 }}>
        <Title style={{ fontSize: 16 }}>By outlet</Title>
        <View style={{ marginTop: 8 }}>
          {bySchool.length === 0 && <Muted>—</Muted>}
          {bySchool.map((s) => (
            <Row
              key={s.school_id}
              style={{ justifyContent: "space-between", paddingVertical: 6 }}
            >
              <Text style={{ color: colors.text }}>{outletMap[s.school_id] ?? "—"}</Text>
              <Text style={{ color: colors.text, fontVariant: ["tabular-nums"] }}>
                {inr(s.gross)}{" "}
                <Text style={{ color: colors.muted, fontSize: 11 }}>· {s.count}</Text>
              </Text>
            </Row>
          ))}
        </View>
      </Panel>

      <Panel>
        <Title style={{ fontSize: 16 }}>🕒 Recent</Title>
        {filtered.slice(0, 10).map((o) => (
          <Row
            key={o.id}
            style={{
              justifyContent: "space-between",
              paddingVertical: 8,
              borderBottomColor: colors.border,
              borderBottomWidth: 1,
            }}
          >
            <View>
              <Text style={{ color: colors.text, fontSize: 12, fontFamily: "monospace" }}>
                {o.local_order_number}
              </Text>
              <Muted style={{ fontSize: 11 }}>
                {new Date(o.created_at).toLocaleTimeString()}{" · "}
                {MODE_ICON[o.payment_mode] ?? "💰"} {o.payment_mode}
                {o.payment_reference ? ` · ${o.payment_reference}` : ""}
              </Muted>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: colors.text, fontWeight: "600" }}>
                {inr(Number(o.grand_total ?? 0))}
              </Text>
              <Badge variant={o.sync_status === "synced" ? "online" : "offline"}>
                {o.sync_status}
              </Badge>
            </View>
          </Row>
        ))}
        {filtered.length === 0 && (
          <Muted style={{ textAlign: "center", paddingVertical: 14 }}>—</Muted>
        )}
      </Panel>

      <Panel style={{ marginTop: 12, padding: 12 }}>
        <Muted style={{ fontSize: 11 }}>
          UPI totals are based on what the POS rang up. Bank-side reconciliation
          requires a payment gateway (Razorpay / Cashfree / Paytm).
        </Muted>
      </Panel>
    </ScrollView>
  );
}
