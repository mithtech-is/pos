import React, { useEffect, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import uuidv4 from "react-native-uuid";
import { buildIdempotencyKey } from "@pos/shared";
import {
  Badge,
  Button,
  Input,
  Muted,
  Panel,
  Row,
  Title,
  inr,
  styles,
} from "../components/ui";
import { colors, radius } from "../theme";
import { useAuthStore } from "../state/auth";
import {
  audit,
  inventory,
  orders as ordersRepo,
  settings,
  syncQueue,
} from "../db/repositories";
import ManagerPinModal from "../components/ManagerPinModal";

type Reason =
  | "size_issue"
  | "defective_item"
  | "wrong_product"
  | "duplicate_purchase"
  | "context_change"
  | "other";

const REASONS: { id: Reason; label: string }[] = [
  { id: "size_issue", label: "Size issue" },
  { id: "defective_item", label: "Defective item" },
  { id: "wrong_product", label: "Wrong product" },
  { id: "duplicate_purchase", label: "Duplicate purchase" },
  { id: "context_change", label: "Context change" },
  { id: "other", label: "Other" },
];

export default function ReturnsScreen() {
  const user = useAuthStore((s) => s.user);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [lines, setLines] = useState<Record<number, { qty: number; reason: Reason }>>({});
  const [refundMode, setRefundMode] = useState<"cash" | "store_credit">("cash");
  const [pinOpen, setPinOpen] = useState(false);
  const [pendingItems, setPendingItems] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => setMatches(await ordersRepo.list({ limit: 200 })))().catch(() => {});
  }, []);

  function runSearch(text: string) {
    setQuery(text);
    const term = text.trim().toLowerCase();
    if (!term) return;
    ordersRepo.list({ limit: 200 }).then((all) =>
      setMatches(
        all.filter(
          (o) =>
            o.local_order_number?.toLowerCase().includes(term) ||
            o.parent_mobile?.toLowerCase().includes(term),
        ),
      ),
    );
  }

  async function openOrder(id: number) {
    const full = await ordersRepo.getById(id);
    setSelected(full);
    setLines({});
    setMessage(null);
  }

  function updateLine(itemId: number, qty: number, reason: Reason) {
    setLines((prev) => ({ ...prev, [itemId]: { qty: Math.max(0, qty), reason } }));
  }

  function startSubmit() {
    if (!selected) return;
    const items = Object.entries(lines)
      .filter(([, l]) => l.qty > 0)
      .map(([id, l]) => {
        const orig = selected.items.find((it: any) => it.id === Number(id));
        const perUnit = orig.line_total / Math.max(1, orig.quantity);
        return {
          variant_id: orig.variant_id,
          sku: orig.sku,
          product_name: orig.product_name,
          quantity: l.qty,
          refund_amount: perUnit * l.qty,
          reason: l.reason,
        };
      });
    if (items.length === 0) {
      setMessage("Pick at least one line");
      return;
    }
    setPendingItems(items);
    setPinOpen(true);
  }

  async function commitReturn() {
    setPinOpen(false);
    if (!user || !selected) return;
    setBusy(true);
    try {
      const deviceCode = (await settings.get<string>("device_code")) ?? "POS001";
      const localReturnId = `RET-${selected.local_order_number}-${String(uuidv4.v4()).slice(0, 6)}`;
      const idempotencyKey = buildIdempotencyKey(deviceCode, localReturnId);
      const createdAt = new Date().toISOString();
      // Bring stock back.
      for (const item of pendingItems) {
        await inventory.applySale(item.variant_id, -item.quantity);
      }
      await syncQueue.enqueue({
        event_type: "return.created",
        idempotency_key: idempotencyKey,
        payload: {
          device_id: deviceCode,
          cashier_id: user.id,
          original_order_id: selected.server_order_id ?? selected.local_order_number,
          manager_pin_verified: true,
          items: pendingItems,
          refund_mode: refundMode,
          idempotency_key: idempotencyKey,
          created_at: createdAt,
        },
      });
      const refund = pendingItems.reduce((s, it) => s + it.refund_amount, 0);
      await audit.log({
        user_id: user.id,
        device_id: deviceCode,
        action: "return.created",
        data: { original: selected.local_order_number, items: pendingItems, refund },
      });
      setMessage(`Return ${localReturnId} queued · refund ${inr(refund)} ${refundMode}`);
      setSelected(null);
      setLines({});
      setPendingItems([]);
    } catch (err) {
      setMessage(`Return failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const refund = Object.entries(lines).reduce((sum, [id, l]) => {
    if (!l.qty || !selected) return sum;
    const orig = selected.items.find((it: any) => it.id === Number(id));
    if (!orig) return sum;
    const perUnit = orig.line_total / Math.max(1, orig.quantity);
    return sum + perUnit * l.qty;
  }, 0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.scrollPad}>
      <Title style={{ marginBottom: 8 }}>↩️ Returns</Title>
      <Input
        placeholder="Local # or customer mobile"
        value={query}
        onChangeText={runSearch}
        helper="Search the cashier's local orders."
      />
      <View style={{ height: 12 }} />
      {matches.slice(0, 8).map((o) => (
        <TouchableOpacity key={o.id} onPress={() => openOrder(o.id)}>
          <Panel
            style={{
              marginBottom: 6,
              borderColor: selected?.id === o.id ? colors.accent : colors.border,
            }}
          >
            <Row style={{ justifyContent: "space-between" }}>
              <View>
                <Text style={{ color: colors.text, fontFamily: "monospace" }}>
                  {o.local_order_number}
                </Text>
                <Muted>
                  {o.parent_mobile ?? "no mobile"} · {inr(Number(o.grand_total ?? 0))}
                </Muted>
              </View>
              <Muted style={{ fontSize: 11 }}>{(o.created_at ?? "").slice(0, 10)}</Muted>
            </Row>
          </Panel>
        </TouchableOpacity>
      ))}

      {selected && (
        <Panel style={{ marginTop: 12 }}>
          <Title style={{ fontSize: 16 }}>Return items from {selected.local_order_number}</Title>
          <Muted>
            Customer: {selected.student_name ?? "—"} · {selected.parent_mobile ?? "—"}
          </Muted>
          <View style={{ height: 12 }} />
          {selected.items.map((it: any) => {
            const sel = lines[it.id];
            const perUnit = it.line_total / Math.max(1, it.quantity);
            return (
              <Panel key={it.id} style={{ marginBottom: 8 }}>
                <Text style={{ color: colors.text, fontWeight: "600" }}>{it.product_name}</Text>
                <Muted>size {it.size} · sold {it.quantity} · {inr(perUnit)} ea</Muted>
                <View style={{ height: 8 }} />
                <Row gap={8}>
                  <View style={{ flex: 1 }}>
                    <Input
                      label="Return qty"
                      value={String(sel?.qty ?? 0)}
                      onChangeText={(t) =>
                        updateLine(it.id, Number(t) || 0, sel?.reason ?? "size_issue")
                      }
                      keyboardType="number-pad"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 4 }}>REASON</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                      {REASONS.map((r) => (
                        <TouchableOpacity
                          key={r.id}
                          onPress={() => updateLine(it.id, sel?.qty ?? 0, r.id)}
                          style={{
                            backgroundColor:
                              sel?.reason === r.id ? colors.accentSoft : colors.bgElev1,
                            borderColor:
                              sel?.reason === r.id ? colors.accent : colors.border,
                            borderWidth: 1,
                            paddingHorizontal: 8,
                            paddingVertical: 6,
                            borderRadius: radius.sm,
                          }}
                        >
                          <Text style={{ color: colors.text, fontSize: 11 }}>{r.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </Row>
                <Muted style={{ marginTop: 4 }}>
                  Refund: {inr(perUnit * (sel?.qty ?? 0))}
                </Muted>
              </Panel>
            );
          })}

          <Row gap={8} style={{ marginTop: 8 }}>
            <Button
              variant={refundMode === "cash" ? "primary" : "ghost"}
              onPress={() => setRefundMode("cash")}
              style={{ flex: 1 }}
            >
              Cash refund
            </Button>
            <Button
              variant={refundMode === "store_credit" ? "primary" : "ghost"}
              onPress={() => setRefundMode("store_credit")}
              style={{ flex: 1 }}
            >
              Store credit
            </Button>
          </Row>
          <View style={{ height: 12 }} />
          <Row style={{ justifyContent: "space-between" }}>
            <Title style={{ fontSize: 16 }}>Refund total</Title>
            <Title style={{ fontSize: 22 }}>{inr(refund)}</Title>
          </Row>
          <View style={{ height: 10 }} />
          <Button
            onPress={startSubmit}
            variant="primary"
            size="lg"
            loading={busy}
            disabled={refund <= 0}
          >
            Process return (manager PIN)
          </Button>
          {message && (
            <Text style={{ color: colors.info, marginTop: 8 }}>{message}</Text>
          )}
        </Panel>
      )}

      <ManagerPinModal
        visible={pinOpen}
        action="return"
        description={`Approve return of ${pendingItems.length} line(s) — refund ${inr(refund)} (${refundMode})`}
        onApprove={() => commitReturn()}
        onCancel={() => setPinOpen(false)}
      />
    </ScrollView>
  );
}
