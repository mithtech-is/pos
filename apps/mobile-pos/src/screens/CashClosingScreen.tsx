import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import uuidv4 from "react-native-uuid";
import {
  Button,
  Input,
  Muted,
  Panel,
  Row,
  Stat,
  Title,
  inr,
  styles,
} from "../components/ui";
import { sanitizeNumericInput, INPUT_LIMITS } from "@pos/shared";
import { colors } from "../theme";
import { useAuthStore } from "../state/auth";
import { audit, orders as ordersRepo, settings, syncQueue } from "../db/repositories";

export default function CashClosingScreen() {
  const user = useAuthStore((s) => s.user);
  const [orders, setOrders] = useState<any[]>([]);
  const [openingFloat, setOpeningFloat] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const list = await ordersRepo.list({ limit: 500 });
      setOrders(list.filter((o) => (o.created_at ?? "").startsWith(today)));
      const f = await settings.get<number>("opening_float");
      if (typeof f === "number") setOpeningFloat(String(f));
    })().catch(() => {});
  }, []);

  const totals = useMemo(() => {
    let cash = 0, upi = 0, card = 0, credit = 0;
    for (const o of orders) {
      const amt = Number(o.grand_total ?? 0);
      switch (o.payment_mode) {
        case "cash": cash += amt; break;
        case "upi": upi += amt; break;
        case "card": card += amt; break;
        case "credit": credit += amt; break;
      }
    }
    return { cash, upi, card, credit };
  }, [orders]);

  const openingNum = Number(openingFloat) || 0;
  const countedNum = Number(countedCash) || 0;
  const expectedCash = openingNum + totals.cash;
  const variance = countedNum - expectedCash;

  async function saveOpening() {
    setBusy(true);
    try {
      await settings.set("opening_float", openingNum);
      await settings.set("shift_opened_at", new Date().toISOString());
      setMessage(`Shift opened with ₹${openingNum.toFixed(2)} float`);
    } finally {
      setBusy(false);
    }
  }

  async function closeShift() {
    if (!user) return;
    setBusy(true);
    setMessage(null);
    try {
      const deviceCode = (await settings.get<string>("device_code")) ?? "POS001";
      const openedAt = (await settings.get<string>("shift_opened_at")) ?? new Date().toISOString();
      const closedAt = new Date().toISOString();
      const idempotencyKey = `${deviceCode}:cash-closing:${closedAt}:${String(uuidv4.v4()).slice(0, 8)}`;
      await syncQueue.enqueue({
        event_type: "cash.closed",
        idempotency_key: idempotencyKey,
        payload: {
          device_id: deviceCode,
          cashier_id: user.id,
          opened_at: openedAt,
          closed_at: closedAt,
          cash_in_drawer: countedNum,
          cash_collected: totals.cash,
          upi_collected: totals.upi,
          card_collected: totals.card,
          credit_outstanding: totals.credit,
          opening_float: openingNum,
          expected_cash: expectedCash,
          variance,
          notes,
          idempotency_key: idempotencyKey,
        },
      });
      await audit.log({
        user_id: user.id,
        device_id: deviceCode,
        action: "cash.closed",
        data: { totals, expectedCash, countedCash: countedNum, variance, notes },
      });
      await settings.set("opening_float", 0);
      await settings.set("shift_opened_at", null);
      setMessage(
        variance === 0
          ? "Shift closed clean — no variance."
          : `Shift closed with variance of ₹${variance.toFixed(2)}.`,
      );
      setOpeningFloat("");
      setCountedCash("");
      setNotes("");
    } catch (err) {
      setMessage(`Close failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollPad}>
      <Title style={{ marginBottom: 12 }}>🔐 Cash closing</Title>

      <Panel elev style={{ marginBottom: 12 }}>
        <Title style={{ fontSize: 16, marginBottom: 8 }}>Today's collection</Title>
        <Row gap={8}>
          <Stat label="💵 Cash" value={inr(totals.cash)} tone="success" />
          <Stat label="📱 UPI" value={inr(totals.upi)} tone="info" />
        </Row>
        <View style={{ height: 8 }} />
        <Row gap={8}>
          <Stat label="💳 Card" value={inr(totals.card)} />
          <Stat label="📒 Credit" value={inr(totals.credit)} tone="warning" />
        </Row>
        <Muted style={{ marginTop: 8 }}>
          {orders.length} order{orders.length !== 1 ? "s" : ""} today
        </Muted>
      </Panel>

      <Panel elev>
        <Title style={{ fontSize: 16, marginBottom: 8 }}>Shift management</Title>
        <Input
          label="Opening float"
          value={openingFloat}
          onChangeText={(t) => setOpeningFloat(sanitizeNumericInput(t, { max: INPUT_LIMITS.MONEY_MAX, decimals: true }))}
          keyboardType="number-pad"
        />
        <View style={{ height: 8 }} />
        <Button onPress={saveOpening} variant="ghost" loading={busy}>
          Save opening float
        </Button>
        <View style={{ height: 16 }} />
        <Row gap={8}>
          <Stat
            label="Expected cash"
            value={inr(expectedCash)}
            hint="opening + cash sales"
          />
          <Stat
            label="Variance"
            value={`${variance >= 0 ? "+" : ""}${inr(variance)}`}
            tone={
              variance === 0
                ? "success"
                : Math.abs(variance) > 100
                  ? "danger"
                  : "warning"
            }
          />
        </Row>
        <View style={{ height: 12 }} />
        <Input
          label="Counted cash"
          value={countedCash}
          onChangeText={(t) => setCountedCash(sanitizeNumericInput(t, { max: INPUT_LIMITS.MONEY_MAX, decimals: true }))}
          keyboardType="number-pad"
        />
        <View style={{ height: 8 }} />
        <Input
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          placeholder="Reason for variance, missing receipts, etc."
        />
        <View style={{ height: 12 }} />
        <Button onPress={closeShift} variant="primary" size="lg" loading={busy}>
          Close shift
        </Button>
        {message && (
          <Text style={{ color: colors.info, marginTop: 8 }}>{message}</Text>
        )}
      </Panel>
    </ScrollView>
  );
}
