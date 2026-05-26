import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
  FlatList,
  Text as RNText,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  BottomSheet,
  Button,
  Card,
  DateRangeFilter,
  type DateRange,
  Divider,
  Layout,
  MultiSelectFilter,
  SearchInput,
  Skeleton,
  StatusPill,
  Text,
  Toast,
  ToastMessage,
  inr,
  inr2,
  useTheme,
} from "../design";
import { TopBar } from "../navigation/TopBar";
import { masterData, orders as ordersRepo, settings, users } from "../db/repositories";
import { useCartStore } from "../state/cart";
import { useAuthStore } from "../state/auth";
import { printReceipt, shareReceiptPdf } from "../receipt";
import type { ReceiptData } from "@pos/shared";

/**
 * Orders tab — Agilo-style "My Orders".
 *
 *   ≡  Orders                                • Online · 0 pending
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  My Orders                                              │
 *   │  [search box                                          ] │
 *   │  [Status ▾]  [Date ▾]                                   │
 *   │  ┌────────────────────────────────────────────────────┐ │
 *   │  │ Order #POS001-...   Jul 6 2025                     │ │
 *   │  │ Aarav Shah · 9999999999                            │ │
 *   │  │ ₹1,250                          [ Synced ]         │ │
 *   │  └────────────────────────────────────────────────────┘ │
 *   │  ...                                                     │
 *   └──────────────────────────────────────────────────────────┘
 *
 * Tapping a card opens a BottomSheet detail with line items + totals + the
 * Print / Share PDF / Re-order actions.
 */

type SyncStatus = "synced" | "pending" | "failed" | "conflict";

const STATUS_OPTIONS = [
  { id: "synced", label: "Synced" },
  { id: "pending", label: "Pending" },
  { id: "failed", label: "Failed" },
  { id: "conflict", label: "Conflict" },
];

export default function OrdersScreen() {
  const t = useTheme();
  const nav = useNavigation<NativeStackNavigationProp<any>>();
  const cart = useCartStore();
  const user = useAuthStore((s) => s.user);

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null });
  const [activeOrderId, setActiveOrderId] = useState<number | null>(null);
  const [activeOrder, setActiveOrder] = useState<any | null>(null);
  const [printingMode, setPrintingMode] = useState<"print" | "share" | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const load = useCallback(async () => {
    const list = await ordersRepo.list({ limit: 300 });
    setItems(list);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((o) => {
      // Search match
      if (q) {
        const hay = [
          o.local_order_number,
          o.server_order_id,
          o.student_name,
          o.parent_mobile,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // Status match
      if (statusFilter.length > 0) {
        const s = (o.sync_status as SyncStatus) ?? "pending";
        if (!statusFilter.includes(s)) return false;
      }
      // Date range match
      if (dateRange.from || dateRange.to) {
        const t = o.created_at ? new Date(o.created_at).getTime() : 0;
        if (dateRange.from && t < new Date(dateRange.from).getTime()) return false;
        if (dateRange.to && t > new Date(dateRange.to).getTime()) return false;
      }
      return true;
    });
  }, [items, query, statusFilter, dateRange]);

  async function openOrder(id: number) {
    setActiveOrderId(id);
    setActiveOrder(null);
    const full = await ordersRepo.getById(id);
    setActiveOrder(full);
  }

  async function reorder(o: any) {
    const full = await ordersRepo.getById(o.id);
    if (!full) return;
    cart.reset();
    cart.setSchool(full.school_id);
    if (full.class_id) cart.setClass(full.class_id);
    cart.setStudent(full.student_name ?? "", full.parent_mobile ?? "");
    for (const item of full.items ?? []) {
      cart.addLine({
        variant_id: item.variant_id,
        sku: item.sku,
        product_name: item.product_name,
        size: item.size ?? "",
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount: 0,
        tax_rate: 0,
      });
    }
    setActiveOrderId(null);
    nav.getParent()?.navigate("Cart");
  }

  async function handlePrint(id: number, mode: "print" | "share") {
    setPrintingMode(mode);
    try {
      const full = await ordersRepo.getById(id);
      if (!full) throw new Error("Order not found");
      const schools = await masterData.listSchools();
      const schoolName = schools.find((s: any) => s.id === full.school_id)?.name ?? "—";
      const cashierName =
        (await users.list()).find((u: any) => u.id === full.cashier_id)?.name ??
        user?.name ??
        "Cashier";
      const receipt: ReceiptData = {
        distributor_name:
          (await settings.get<string>("distributor_name")) ?? "Trail Blaze Retail",
        distributor_address:
          (await settings.get<string>("distributor_address")) ?? undefined,
        gstin: (await settings.get<string>("distributor_gstin")) ?? undefined,
        receipt_number: full.local_order_number,
        local_order_number: full.local_order_number,
        server_order_number: full.server_order_id ?? null,
        date_time: (full.created_at ?? "").replace("T", " ").slice(0, 19),
        cashier_name: cashierName,
        school_name: schoolName,
        student_name: full.student_name ?? null,
        parent_mobile: full.parent_mobile ?? null,
        items: (full.items ?? []).map((i: any) => ({
          product_name: i.product_name,
          size: i.size ?? "",
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount: i.discount ?? 0,
          tax: i.tax ?? 0,
          line_total: i.line_total,
        })),
        subtotal: Number(full.subtotal ?? 0),
        discount_total: Number(full.discount_total ?? 0),
        tax_total: Number(full.tax_total ?? 0),
        grand_total: Number(full.grand_total ?? 0),
        payment_mode: full.payment_mode,
        payment_reference: full.payment_reference ?? null,
        sync_status: full.sync_status === "synced" ? "synced" : "offline_pending",
      };
      if (mode === "print") await printReceipt(receipt);
      else await shareReceiptPdf(receipt);
    } catch (err) {
      Alert.alert("Failed", (err as Error).message);
    } finally {
      setPrintingMode(null);
    }
  }

  return (
    <Layout edges={["top"]} padded>
      <TopBar title="Orders" />
      <View style={{ paddingTop: 4, paddingBottom: 12 }}>
        <Text variant="title">My Orders</Text>
      </View>

      <View style={{ marginBottom: 10 }}>
        <SearchInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by order #, student, mobile…"
        />
      </View>

      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <MultiSelectFilter
          label="Status"
          options={STATUS_OPTIONS}
          selected={statusFilter}
          onChange={setStatusFilter}
        />
        <DateRangeFilter label="Date" value={dateRange} onChange={setDateRange} />
      </View>

      {loading ? (
        <View style={{ gap: 10 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View
              key={i}
              style={{
                padding: 14,
                borderRadius: t.radius.lg,
                borderColor: t.colors.border,
                borderWidth: 1,
              }}
            >
              <Skeleton width="60%" height={16} />
              <Skeleton width="40%" height={12} style={{ marginTop: 8 }} />
              <Skeleton width="30%" height={14} style={{ marginTop: 12 }} />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(o) => String(o.id)}
          contentContainerStyle={{ gap: 10, paddingBottom: 100 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={t.colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={{ alignItems: "center", padding: 32 }}>
              <RNText style={{ fontSize: 40, opacity: 0.4, marginBottom: 8 }}>📭</RNText>
              <Text variant="body" tone="muted">
                {query || statusFilter.length || dateRange.from
                  ? "No orders match the filters."
                  : "No orders yet."}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <OrderCard order={item} onPress={() => openOrder(item.id)} />
          )}
        />
      )}

      <OrderDetailSheet
        visible={!!activeOrderId}
        order={activeOrder}
        onClose={() => {
          setActiveOrderId(null);
          setActiveOrder(null);
        }}
        onPrint={() => activeOrderId && handlePrint(activeOrderId, "print")}
        onShare={() => activeOrderId && handlePrint(activeOrderId, "share")}
        onReorder={() => activeOrder && reorder(activeOrder)}
        printing={printingMode}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Layout>
  );
}

/* ============================================================
   OrderCard
   ============================================================ */

function OrderCard({ order, onPress }: { order: any; onPress: () => void }) {
  const t = useTheme();
  const status = (order.sync_status as SyncStatus) ?? "pending";
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {order.local_order_number}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <RNText style={{ fontSize: 12 }}>👤</RNText>
              <Text variant="caption" tone="soft" numberOfLines={1}>
                {order.student_name ?? "—"}
                {order.parent_mobile ? ` · ${order.parent_mobile}` : ""}
              </Text>
            </View>
            <Text variant="bodyStrong" style={{ marginTop: 6 }}>
              {inr(Number(order.grand_total ?? 0))}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 6 }}>
            <Text variant="caption" tone="muted">
              {(order.created_at ?? "").slice(0, 10)}
            </Text>
            <StatusPillFor status={status} />
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

function StatusPillFor({ status }: { status: SyncStatus }) {
  switch (status) {
    case "synced":
      return <StatusPill tone="success">Synced</StatusPill>;
    case "pending":
      return <StatusPill tone="warning">Pending sync</StatusPill>;
    case "failed":
      return <StatusPill tone="error">Failed</StatusPill>;
    case "conflict":
      return <StatusPill tone="error">Conflict</StatusPill>;
    default:
      return <StatusPill tone="neutral">{status}</StatusPill>;
  }
}

/* ============================================================
   OrderDetailSheet
   ============================================================ */

function OrderDetailSheet({
  visible,
  order,
  onClose,
  onPrint,
  onShare,
  onReorder,
  printing,
}: {
  visible: boolean;
  order: any | null;
  onClose: () => void;
  onPrint: () => void;
  onShare: () => void;
  onReorder: () => void;
  printing: "print" | "share" | null;
}) {
  const t = useTheme();
  return (
    <BottomSheet
      visible={visible}
      title={order?.local_order_number ?? "Order"}
      onClose={onClose}
      heightFraction={0.85}
    >
      {!order ? (
        <View style={{ padding: 20, gap: 10 }}>
          <Skeleton height={20} width="60%" />
          <Skeleton height={14} width="40%" />
          <Skeleton height={120} style={{ marginTop: 16 }} />
        </View>
      ) : (
        <ScrollView
          style={{ paddingHorizontal: 20 }}
          contentContainerStyle={{ paddingBottom: 32, gap: 14 }}
        >
          <View>
            <Text variant="caption" tone="muted">
              {(order.created_at ?? "").slice(0, 19).replace("T", " ")}
            </Text>
            <Text variant="title" style={{ marginTop: 4 }}>
              {inr2(Number(order.grand_total ?? 0))}
            </Text>
            <View style={{ flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <StatusPillFor status={order.sync_status ?? "pending"} />
              <StatusPill tone="neutral">{order.payment_mode}</StatusPill>
              {order.payment_reference && (
                <StatusPill tone="active">{order.payment_reference}</StatusPill>
              )}
            </View>
          </View>

          {(order.student_name || order.parent_mobile) && (
            <Card>
              <Text variant="caption" tone="muted">Customer</Text>
              <Text variant="body" style={{ marginTop: 2 }}>
                {order.student_name ?? "—"}
              </Text>
              {order.parent_mobile && (
                <Text variant="caption" tone="soft" style={{ marginTop: 2 }}>
                  {order.parent_mobile}
                </Text>
              )}
            </Card>
          )}

          <View>
            <Text variant="label" tone="muted" style={{ marginBottom: 8 }}>
              ITEMS
            </Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: t.colors.border,
                borderRadius: t.radius.lg,
                overflow: "hidden",
              }}
            >
              {(order.items ?? []).map((it: any, idx: number) => (
                <View
                  key={it.id ?? idx}
                  style={{
                    flexDirection: "row",
                    padding: 12,
                    gap: 10,
                    alignItems: "center",
                    borderBottomColor: t.colors.border,
                    borderBottomWidth:
                      idx === (order.items?.length ?? 0) - 1 ? 0 : 1,
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: t.radius.sm,
                      backgroundColor: t.colors.surface3,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <RNText style={{ fontSize: 22, opacity: 0.5 }}>👕</RNText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="body" numberOfLines={1}>
                      {it.product_name}
                    </Text>
                    <Text variant="caption" tone="muted">
                      size {it.size ?? "-"} · qty {it.quantity}
                    </Text>
                  </View>
                  <Text variant="bodyStrong">{inr2(it.line_total)}</Text>
                </View>
              ))}
            </View>
          </View>

          <Card>
            <TotalRow label="Subtotal" value={inr2(Number(order.subtotal ?? 0))} />
            <TotalRow label="Discount" value={`− ${inr2(Number(order.discount_total ?? 0))}`} />
            <TotalRow label="Tax" value={inr2(Number(order.tax_total ?? 0))} />
            <Divider style={{ marginVertical: 8 }} />
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text variant="heading">Total</Text>
              <Text variant="title">{inr2(Number(order.grand_total ?? 0))}</Text>
            </View>
          </Card>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              variant="outline"
              size="md"
              onPress={onPrint}
              loading={printing === "print"}
              style={{ flex: 1 }}
            >
              🖨 Print
            </Button>
            <Button
              variant="outline"
              size="md"
              onPress={onShare}
              loading={printing === "share"}
              style={{ flex: 1 }}
            >
              📤 Share
            </Button>
            <Button variant="primary" size="md" onPress={onReorder} style={{ flex: 1 }}>
              ↻ Re-order
            </Button>
          </View>
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const TotalRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View
    style={{
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 4,
    }}
  >
    <Text variant="caption" tone="soft">
      {label}
    </Text>
    <Text variant="body">{value}</Text>
  </View>
);
