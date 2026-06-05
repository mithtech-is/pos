import React, { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  TouchableOpacity,
  View,
  Text as RNText,
} from "react-native";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import uuidv4 from "react-native-uuid";
import { buildIdempotencyKey } from "@pos/shared";
import {
  BottomSheet,
  Button,
  Card,
  Dialog,
  Divider,
  Field,
  Layout,
  Prompt,
  QuantityPicker,
  StatusPill,
  SwipeableListItem,
  Text,
  Toast,
  ToastMessage,
  inr,
  inr2,
  useTheme,
} from "../design";
import { TopBar } from "../navigation/TopBar";
import { useAuthStore } from "../state/auth";
import { useCartStore } from "../state/cart";
import {
  audit,
  inventory,
  masterData,
  orders,
  settings,
  syncQueue,
} from "../db/repositories";
import ManagerPinModal from "../components/ManagerPinModal";
import UpiQrModal from "../components/UpiQrModal";
import { printReceipt, shareReceiptPdf } from "../receipt";
import type { ReceiptData } from "@pos/shared";

const DISCOUNT_PIN_THRESHOLD_PCT = 10;

type PaymentMode = "cash" | "upi" | "credit";

/**
 * Cart tab — the heart of the POS.
 *
 * Layout (top to bottom, like the Agilo screenshots):
 *   1. Context strip: outlet + group + type (tap to change)
 *   2. Customer chip: customer name + mobile (tap to add/edit)
 *   3. Cart lines (swipe right to delete; built-in quantity picker)
 *   4. Add Promotion button → discount Dialog
 *   5. Totals block (Subtotal / Discount / Tax / Total)
 *   6. Payment-mode picker + Checkout CTA
 *   7. Last bill panel (Print / Share PDF) shown after a sale
 *
 * Offline-first contract — completing a sale always:
 *   • writes to `local_orders` + `local_order_items`
 *   • decrements local stock
 *   • enqueues an `order.created` event in `sync_events`
 *   • logs an audit entry
 *   • never blocks on the network
 */
export default function CartScreen() {
  const t = useTheme();
  const user = useAuthStore((s) => s.user);
  const cart = useCartStore();
  const route = useRoute<any>();
  const nav = useNavigation<any>();

  /* ───────── pickers + sheets ───────── */
  const [contextOpen, setContextOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  /* ───────── lookups for chip labels ───────── */
  const [schools, setSchools] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [kit, setKit] = useState<{ kit: any; items: any[] } | null>(null);

  /* ───────── payment + discount ───────── */
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [cartDiscount, setCartDiscount] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [discountApprovedBy, setDiscountApprovedBy] = useState<string | null>(null);
  const [pinModal, setPinModal] = useState<{
    action: string;
    description: string;
    onApprove: (info: any) => void;
  } | null>(null);
  const [upiModal, setUpiModal] = useState<null | {
    amount: number;
    reference: string;
    vpa: string;
    payeeName: string;
    onPaid: (utr: string) => void;
  }>(null);

  /* ───────── busy + feedback ───────── */
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null);
  const [printBusy, setPrintBusy] = useState(false);

  /* ───────── lookup loads ───────── */
  useEffect(() => {
    (async () => setSchools(await masterData.listSchools()))().catch(() => {});
  }, []);

  useEffect(() => {
    if (!cart.school_id) {
      setClasses([]);
      return;
    }
    (async () => setClasses(await masterData.listClasses(cart.school_id!)))().catch(() => {});
  }, [cart.school_id]);

  useEffect(() => {
    if (!cart.school_id || !cart.class_id) {
      setKit(null);
      return;
    }
    (async () => {
      const k = await masterData.findKitByContext({
        school_id: cart.school_id!,
        class_id: cart.class_id!,
        gender: cart.gender,
        uniform_type: cart.uniform_type,
      });
      setKit(k);
    })().catch(() => setKit(null));
  }, [cart.school_id, cart.class_id, cart.gender, cart.uniform_type]);

  /* ───────── handle scan from Scan tab ───────── */
  useFocusEffect(
    React.useCallback(() => {
      const code = route.params?.scanned;
      if (code) {
        nav.setParams({ scanned: undefined });
        (async () => {
          const variant: any = await masterData.findByBarcode(code);
          if (!variant) {
            showToast("error", `No product for "${code}"`);
            return;
          }
          cart.addLine({
            variant_id: variant.id,
            sku: variant.sku,
            product_name: variant.product_name ?? "Item",
            size: variant.size ?? "",
            quantity: 1,
            unit_price: variant.price ?? 0,
            discount: 0,
            tax_rate: variant.tax_rate ?? 0,
          });
          showToast("success", `Added ${variant.product_name}`);
        })().catch((e) => showToast("error", e.message));
      }
    }, [route.params?.scanned, cart, nav]),
  );

  function showToast(kind: ToastMessage["kind"], text: string) {
    setToast({ id: String(Date.now()), kind, text });
  }

  /* ───────── totals + discount approval gate ───────── */
  const baseTotals = useMemo(() => cart.totals(), [cart.lines]);
  const totals = useMemo(() => {
    const cd = Number(cartDiscount) || 0;
    const grand_total = Math.max(0, baseTotals.grand_total - cd);
    return {
      ...baseTotals,
      discount_total: baseTotals.discount_total + cd,
      grand_total,
    };
  }, [baseTotals, cartDiscount]);

  const effectiveDiscountPct =
    baseTotals.subtotal > 0
      ? (totals.discount_total / baseTotals.subtotal) * 100
      : 0;

  function applyDiscount(amountStr: string, code: string) {
    setCartDiscount(amountStr);
    setPromoCode(code);
    const amt = Number(amountStr) || 0;
    if (amt <= 0) {
      setDiscountApprovedBy(null);
      return;
    }
    const pct = baseTotals.subtotal > 0 ? (amt / baseTotals.subtotal) * 100 : 0;
    if (pct <= DISCOUNT_PIN_THRESHOLD_PCT || user?.role === "manager") {
      setDiscountApprovedBy(user?.role === "manager" ? user.id : "auto");
      return;
    }
    setDiscountApprovedBy(null);
    setPinModal({
      action: "high_discount",
      description: `Apply ${inr(amt)} discount (${pct.toFixed(1)}%) on cart`,
      onApprove: (info) => {
        setDiscountApprovedBy(info.manager_user_id ?? "offline-approval");
        setPinModal(null);
      },
    });
  }

  /* ───────── complete sale ───────── */
  async function onPressCheckout() {
    if (!user) return;
    if (cart.lines.length === 0) return showToast("error", "Cart is empty");
    if (!cart.school_id) return showToast("error", "Pick an outlet first");
    if (
      effectiveDiscountPct > DISCOUNT_PIN_THRESHOLD_PCT &&
      !discountApprovedBy &&
      user.role !== "manager"
    ) {
      return showToast("error", "Discount needs manager approval");
    }
    if (paymentMode === "upi") {
      const vpa = (await settings.get<string>("upi_vpa")) ?? "";
      if (!vpa) return showToast("error", "Set UPI VPA in Settings");
      const payeeName = (await settings.get<string>("upi_payee_name")) ?? "Distributor";
      setUpiModal({
        amount: totals.grand_total,
        reference: `POS-${Date.now()}`,
        vpa,
        payeeName,
        onPaid: (utr) => {
          setUpiModal(null);
          void doCompleteSale(utr);
        },
      });
      return;
    }
    void doCompleteSale(null);
  }

  async function doCompleteSale(reference: string | null) {
    if (!user) return;
    setBusy(true);
    try {
      // 1. Stock check (allow override per Settings.allow_negative_stock).
      for (const line of cart.lines) {
        if (line.variant_id.startsWith("manual-")) continue;
        const available = await inventory.getLocalAvailable(line.variant_id);
        if (available < line.quantity) {
          const allowNegative =
            (await settings.get<boolean>("allow_negative_stock")) === true;
          if (!allowNegative) {
            throw new Error(
              `Insufficient stock for ${line.product_name}: ${available} avail, ${line.quantity} needed`,
            );
          }
        }
      }

      // 2. Allocate IDs + persist locally — never blocks on network.
      const deviceCode = (await settings.get<string>("device_code")) ?? "POS001";
      const localOrderNumber = await orders.allocateLocalOrderNumber(deviceCode, new Date());
      const idempotencyKey = buildIdempotencyKey(deviceCode, localOrderNumber);
      const createdAt = new Date().toISOString();
      const itemsForDb = cart.lines.map((l) => ({
        variant_id: l.variant_id,
        sku: l.sku,
        product_name: l.product_name,
        size: l.size,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount: l.discount,
        tax: Math.max(0, l.quantity * l.unit_price - l.discount) * l.tax_rate,
        line_total:
          l.quantity * l.unit_price -
          l.discount +
          Math.max(0, l.quantity * l.unit_price - l.discount) * l.tax_rate,
      }));

      await orders.create({
        local_order_number: localOrderNumber,
        idempotency_key: idempotencyKey,
        device_id: deviceCode,
        cashier_id: user.id,
        school_id: cart.school_id!,
        class_id: cart.class_id,
        student_name: cart.student_name || null,
        parent_mobile: cart.parent_mobile || null,
        subtotal: totals.subtotal,
        discount_total: totals.discount_total,
        tax_total: totals.tax_total,
        grand_total: totals.grand_total,
        payment_mode: paymentMode,
        payment_reference: reference,
        items: itemsForDb,
        created_at: createdAt,
      });

      for (const line of cart.lines) {
        if (line.variant_id.startsWith("manual-")) continue;
        await inventory.applySale(line.variant_id, line.quantity);
      }

      await syncQueue.enqueue({
        event_type: "order.created",
        idempotency_key: idempotencyKey,
        payload: {
          device_id: deviceCode,
          cashier_id: user.id,
          school_id: cart.school_id,
          class_id: cart.class_id,
          student_name: cart.student_name || null,
          parent_mobile: cart.parent_mobile || null,
          subtotal: totals.subtotal,
          discount_total: totals.discount_total,
          tax_total: totals.tax_total,
          grand_total: totals.grand_total,
          payment_mode: paymentMode,
          payment_reference: reference,
          promo_code: promoCode || null,
          created_offline: true,
          created_at: createdAt,
          local_order_number: localOrderNumber,
          idempotency_key: idempotencyKey,
          discount_approved_by: discountApprovedBy,
          items: itemsForDb,
        },
      });

      await audit.log({
        user_id: user.id,
        device_id: deviceCode,
        action: "bill.created",
        data: { local_order_number: localOrderNumber, total: totals.grand_total },
      });

      // 3. Build a printable receipt for the success panel.
      const schoolNameForReceipt =
        schools.find((s) => s.id === cart.school_id)?.name ?? "—";
      const receipt: ReceiptData = {
        distributor_name:
          (await settings.get<string>("distributor_name")) ?? "CounterFlow Store",
        distributor_address:
          (await settings.get<string>("distributor_address")) ?? undefined,
        gstin: (await settings.get<string>("distributor_gstin")) ?? undefined,
        receipt_number: localOrderNumber,
        local_order_number: localOrderNumber,
        server_order_number: null,
        date_time: createdAt.replace("T", " ").slice(0, 19),
        cashier_name: user.name,
        school_name: schoolNameForReceipt,
        student_name: cart.student_name || null,
        parent_mobile: cart.parent_mobile || null,
        items: itemsForDb.map((i) => ({
          product_name: i.product_name,
          size: i.size ?? "",
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount: i.discount,
          tax: i.tax,
          line_total: i.line_total,
        })),
        subtotal: totals.subtotal,
        discount_total: totals.discount_total,
        tax_total: totals.tax_total,
        grand_total: totals.grand_total,
        payment_mode: paymentMode,
        payment_reference: reference,
        sync_status: "offline_pending",
      };
      setLastReceipt(receipt);

      showToast("success", `Bill ${localOrderNumber} · ${inr(totals.grand_total)}`);
      cart.reset();
      setCartDiscount("");
      setPromoCode("");
      setDiscountApprovedBy(null);
    } catch (err) {
      showToast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePrint() {
    if (!lastReceipt) return;
    setPrintBusy(true);
    try {
      await printReceipt(lastReceipt);
    } catch (err) {
      showToast("error", `Print failed: ${(err as Error).message}`);
    } finally {
      setPrintBusy(false);
    }
  }
  async function handleShare() {
    if (!lastReceipt) return;
    setPrintBusy(true);
    try {
      await shareReceiptPdf(lastReceipt);
    } catch (err) {
      showToast("error", `Share failed: ${(err as Error).message}`);
    } finally {
      setPrintBusy(false);
    }
  }

  /* ───────── derived labels ───────── */
  const schoolName = schools.find((s) => s.id === cart.school_id)?.name;
  const className = classes.find((c) => c.id === cart.class_id)?.class_name;
  const customerLabel = cart.student_name || cart.parent_mobile;
  const contextReady = !!cart.school_id;

  return (
    <Layout edges={["top"]} padded>
      <TopBar title="Cart" />
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={{ paddingTop: 4, paddingBottom: 8 }}>
          <Text variant="title">Cart</Text>
        </View>

        {/* ── Customer chip ── */}
        <TouchableOpacity
          onPress={() => setCustomerOpen(true)}
          activeOpacity={0.7}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 14,
            borderRadius: t.radius.md,
            borderWidth: 1,
            borderColor: t.colors.border,
            backgroundColor: t.colors.surface,
            marginBottom: 10,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <RNText style={{ fontSize: 18 }}>👤</RNText>
            <View>
              <Text variant="body">
                {customerLabel || "Add Customer"}
              </Text>
              {cart.parent_mobile && cart.student_name && (
                <Text variant="caption" tone="muted">
                  {cart.parent_mobile}
                </Text>
              )}
            </View>
          </View>
          <RNText style={{ color: t.colors.muted, fontSize: 16 }}>›</RNText>
        </TouchableOpacity>

        {/* Context chip */}
        <TouchableOpacity
          onPress={() => setContextOpen(true)}
          activeOpacity={0.7}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 14,
            borderRadius: t.radius.md,
            borderWidth: 1,
            borderColor: contextReady ? t.colors.border : t.colors.errorFg,
            backgroundColor: t.colors.surface,
            marginBottom: 14,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
            <RNText style={{ fontSize: 18 }}>🏫</RNText>
            <View style={{ flex: 1 }}>
              <Text variant="body" numberOfLines={1}>
                {schoolName ?? "Select outlet"}
              </Text>
              <Text variant="caption" tone="muted">
                {className ? `Group ${className} · ` : ""}
                {pretty(cart.gender)} · {prettyUniform(cart.uniform_type)}
              </Text>
            </View>
          </View>
          <RNText style={{ color: t.colors.muted, fontSize: 16 }}>›</RNText>
        </TouchableOpacity>

        {/* ── Suggested kit (if found for context) ── */}
        {kit && (
          <Card style={{ marginBottom: 14, backgroundColor: t.colors.activeBg, borderColor: t.colors.activeBg }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" style={{ color: t.colors.activeFg }}>
                  Suggested kit · {kit.kit?.name}
                </Text>
                <RNText
                  style={{ color: t.colors.activeFg, fontSize: 12, marginTop: 2, opacity: 0.85 }}
                >
                  {kit.items.length} items match this context
                </RNText>
              </View>
              <Button
                variant="primary"
                size="sm"
                onPress={() => {
                  for (const item of kit.items) {
                    cart.addLine({
                      variant_id: item.variant_id,
                      sku: item.sku ?? "",
                      product_name: item.product_name ?? "Kit item",
                      size: item.size ?? "",
                      quantity: item.quantity ?? 1,
                      unit_price: item.price ?? 0,
                      discount: 0,
                      tax_rate: 0,
                    });
                  }
                  showToast("success", `Added kit (${kit.items.length} items)`);
                }}
              >
                Add kit
              </Button>
            </View>
          </Card>
        )}

        {/* ── Cart lines ── */}
        {cart.lines.length === 0 ? (
          <View style={{ alignItems: "center", padding: 32 }}>
            <RNText style={{ fontSize: 40, opacity: 0.4, marginBottom: 8 }}>🛒</RNText>
            <Text variant="body" tone="muted">Your cart is empty</Text>
            <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
              Scan a barcode or pick from Products.
            </Text>
          </View>
        ) : (
          <View
            style={{
              borderWidth: 1,
              borderColor: t.colors.border,
              borderRadius: t.radius.lg,
              overflow: "hidden",
              backgroundColor: t.colors.surface,
              marginBottom: 14,
            }}
          >
            {cart.lines.map((line, idx) => (
              <SwipeableListItem
                key={line.variant_id}
                onDelete={() => cart.removeLine(line.variant_id)}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    padding: 12,
                    borderBottomColor: t.colors.border,
                    borderBottomWidth: idx === cart.lines.length - 1 ? 0 : 1,
                  }}
                >
                  <View
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: t.radius.md,
                      backgroundColor: t.colors.surface3,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <RNText style={{ fontSize: 28, opacity: 0.5 }}>👕</RNText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {line.product_name}
                    </Text>
                    <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
                      size {line.size || "-"} · {inr(line.unit_price)}
                    </Text>
                    <View style={{ marginTop: 8, alignSelf: "flex-start" }}>
                      <QuantityPicker
                        value={line.quantity}
                        onChange={(n) => cart.updateQty(line.variant_id, n)}
                        min={0}
                        max={99}
                      />
                    </View>
                  </View>
                  <Text variant="bodyStrong">
                    {inr2(line.quantity * line.unit_price - line.discount)}
                  </Text>
                </View>
              </SwipeableListItem>
            ))}
          </View>
        )}

        {/* ── Promotion / discount ── */}
        {cart.lines.length > 0 && (
          <>
            <TouchableOpacity
              onPress={() => setPromoOpen(true)}
              activeOpacity={0.7}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderRadius: t.radius.md,
                borderWidth: 1,
                borderColor: t.colors.border,
                marginBottom: 14,
                gap: 8,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <RNText style={{ fontSize: 18 }}>🏷️</RNText>
                <Text variant="body">
                  {totals.discount_total > 0
                    ? `Discount · ${inr(totals.discount_total)}${promoCode ? ` (${promoCode})` : ""}`
                    : "Add promotion or discount"}
                </Text>
              </View>
              {discountApprovedBy && (
                <StatusPill tone="success" size="sm">
                  Approved
                </StatusPill>
              )}
            </TouchableOpacity>

            {/* ── Totals ── */}
            <Card style={{ marginBottom: 14 }}>
              <TotalRow label="Subtotal" value={inr2(totals.subtotal)} />
              <TotalRow label="Discount" value={`− ${inr2(totals.discount_total)}`} />
              <TotalRow label="Tax" value={inr2(totals.tax_total)} />
              <Divider style={{ marginVertical: 8 }} />
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text variant="heading">Total</Text>
                <Text variant="title" align="right">
                  {inr2(totals.grand_total)}
                </Text>
              </View>
            </Card>

            {/* ── Payment mode ── */}
            <TouchableOpacity
              onPress={() => setPaymentOpen(true)}
              activeOpacity={0.7}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderRadius: t.radius.md,
                borderWidth: 1,
                borderColor: t.colors.border,
                marginBottom: 14,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <RNText style={{ fontSize: 18 }}>💳</RNText>
                <Text variant="body">{prettyPaymentMode(paymentMode)}</Text>
              </View>
              <RNText style={{ color: t.colors.muted, fontSize: 16 }}>›</RNText>
            </TouchableOpacity>

            {/* ── Action bar ── */}
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 18 }}>
              <Button
                variant="outline"
                size="lg"
                onPress={() => setConfirmClear(true)}
                style={{ flex: 1 }}
              >
                Cancel Cart
              </Button>
              <Button
                variant="primary"
                size="lg"
                onPress={onPressCheckout}
                loading={busy}
                style={{ flex: 2 }}
              >
                {paymentMode === "upi"
                  ? `Show QR · ${inr(totals.grand_total)}`
                  : `Checkout · ${inr(totals.grand_total)}`}
              </Button>
            </View>
          </>
        )}

        {/* ── Last receipt (after a sale) ── */}
        {lastReceipt && (
          <Card style={{ marginBottom: 14 }} elev={1}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <View>
                <Text variant="bodyStrong">Last bill</Text>
                <Text variant="caption" tone="muted">
                  {lastReceipt.receipt_number} · {inr(lastReceipt.grand_total)}
                </Text>
              </View>
              <StatusPill tone="success">Sale complete</StatusPill>
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button variant="primary" size="md" onPress={handlePrint} loading={printBusy} style={{ flex: 1 }}>
                🖨 Print
              </Button>
              <Button variant="outline" size="md" onPress={handleShare} loading={printBusy} style={{ flex: 1 }}>
                📤 Share PDF
              </Button>
            </View>
          </Card>
        )}
      </ScrollView>

      {/* ───────── Sheets / Dialogs ───────── */}
      <ContextSheet
        visible={contextOpen}
        onClose={() => setContextOpen(false)}
        schools={schools}
        classes={classes}
      />

      <CustomerSheet
        visible={customerOpen}
        onClose={() => setCustomerOpen(false)}
      />

      <PaymentSheet
        visible={paymentOpen}
        selected={paymentMode}
        onPick={(m) => {
          setPaymentMode(m);
          setPaymentOpen(false);
        }}
        onClose={() => setPaymentOpen(false)}
      />

      <PromotionDialog
        visible={promoOpen}
        currentAmount={cartDiscount}
        currentCode={promoCode}
        onClose={() => setPromoOpen(false)}
        onApply={(amount, code) => {
          applyDiscount(amount, code);
          setPromoOpen(false);
        }}
      />

      <Prompt
        visible={confirmClear}
        title="Cancel cart?"
        message="This clears all items and resets the customer / context. Cannot be undone."
        confirmLabel="Yes, cancel"
        danger
        onConfirm={() => {
          cart.reset();
          setCartDiscount("");
          setPromoCode("");
          setDiscountApprovedBy(null);
          setConfirmClear(false);
          showToast("info", "Cart cleared");
        }}
        onCancel={() => setConfirmClear(false)}
      />

      <ManagerPinModal
        visible={!!pinModal}
        action={pinModal?.action ?? "approve"}
        description={pinModal?.description}
        onApprove={(info) => pinModal?.onApprove(info)}
        onCancel={() => setPinModal(null)}
      />

      {upiModal && (
        <UpiQrModal
          visible
          amount={upiModal.amount}
          reference={upiModal.reference}
          vpa={upiModal.vpa}
          payeeName={upiModal.payeeName}
          onPaid={upiModal.onPaid}
          onCancel={() => setUpiModal(null)}
        />
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Layout>
  );
}

/* ============================================================
   Sub-components
   ============================================================ */

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

function ContextSheet({
  visible,
  onClose,
  schools,
  classes,
}: {
  visible: boolean;
  onClose: () => void;
  schools: any[];
  classes: any[];
}) {
  const t = useTheme();
  const cart = useCartStore();

  const GENDERS: { id: "boy" | "girl" | "unisex"; label: string }[] = [
    { id: "boy", label: "Standard" },
    { id: "girl", label: "Alternate" },
    { id: "unisex", label: "Universal" },
  ];
  const UNIFORM_TYPES = ["regular", "summer", "winter", "sports", "house"];

  return (
    <BottomSheet visible={visible} title="Outlet & context" onClose={onClose} heightFraction={0.85}>
      <ScrollView style={{ paddingHorizontal: 20 }} contentContainerStyle={{ paddingBottom: 32, gap: 18 }}>
        <View>
          <Text variant="label" tone="muted" style={{ marginBottom: 8 }}>
            OUTLET
          </Text>
          <View style={{ gap: 6 }}>
            {schools.map((s) => {
              const active = cart.school_id === s.id;
              return (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => cart.setSchool(s.id)}
                  activeOpacity={0.7}
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderRadius: t.radius.md,
                    borderWidth: 1,
                    borderColor: active ? t.colors.primary : t.colors.border,
                    backgroundColor: active ? t.colors.primarySoft : t.colors.surface,
                  }}
                >
                  <Text variant="body">{s.name}</Text>
                  <Text variant="caption" tone="muted">
                    {s.code}
                    {s.city ? ` · ${s.city}` : ""}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {classes.length > 0 && (
          <View>
            <Text variant="label" tone="muted" style={{ marginBottom: 8 }}>
              GROUP
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {classes.map((c) => {
                const active = cart.class_id === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => cart.setClass(c.id)}
                    activeOpacity={0.7}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      borderRadius: t.radius.pill,
                      borderWidth: 1,
                      borderColor: active ? t.colors.primary : t.colors.border,
                      backgroundColor: active ? t.colors.primary : t.colors.surface,
                    }}
                  >
                    <RNText
                      style={{
                        color: active ? t.colors.primaryFg : t.colors.text,
                        fontSize: 14,
                        fontWeight: "500",
                      }}
                    >
                      Group {c.class_name}
                    </RNText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        <View>
          <Text variant="label" tone="muted" style={{ marginBottom: 8 }}>
            OPTION
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {GENDERS.map((g) => {
              const active = cart.gender === g.id;
              return (
                <TouchableOpacity
                  key={g.id}
                  onPress={() => cart.setGender(g.id)}
                  activeOpacity={0.7}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: t.radius.md,
                    borderWidth: 1,
                    borderColor: active ? t.colors.primary : t.colors.border,
                    backgroundColor: active ? t.colors.primary : t.colors.surface,
                    alignItems: "center",
                  }}
                >
                  <RNText
                    style={{
                      color: active ? t.colors.primaryFg : t.colors.text,
                      fontWeight: "500",
                    }}
                  >
                    {g.label}
                  </RNText>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View>
          <Text variant="label" tone="muted" style={{ marginBottom: 8 }}>
            TYPE
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {UNIFORM_TYPES.map((u) => {
              const active = cart.uniform_type === u;
              return (
                <TouchableOpacity
                  key={u}
                  onPress={() => cart.setUniformType(u)}
                  activeOpacity={0.7}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    borderRadius: t.radius.pill,
                    borderWidth: 1,
                    borderColor: active ? t.colors.primary : t.colors.border,
                    backgroundColor: active ? t.colors.primary : t.colors.surface,
                  }}
                >
                  <RNText
                    style={{
                      color: active ? t.colors.primaryFg : t.colors.text,
                      fontSize: 14,
                      fontWeight: "500",
                      textTransform: "capitalize",
                    }}
                  >
                    {u}
                  </RNText>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <Button variant="primary" size="lg" onPress={onClose} full>
          Done
        </Button>
      </ScrollView>
    </BottomSheet>
  );
}

function CustomerSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const cart = useCartStore();
  const [name, setName] = useState(cart.student_name);
  const [mobile, setMobile] = useState(cart.parent_mobile);

  useEffect(() => {
    if (visible) {
      setName(cart.student_name);
      setMobile(cart.parent_mobile);
    }
  }, [visible, cart.student_name, cart.parent_mobile]);

  return (
    <BottomSheet visible={visible} title="Customer" onClose={onClose} heightFraction={0.5}>
      <View style={{ paddingHorizontal: 20, gap: 14 }}>
        <Field
          label="Customer name"
          value={name}
          onChangeText={setName}
          placeholder="Optional"
        />
        <Field
          label="Customer mobile"
          value={mobile}
          onChangeText={setMobile}
          placeholder="10-digit"
          keyboardType="phone-pad"
        />
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(name || mobile) && (
            <Button
              variant="outline"
              size="md"
              onPress={() => {
                cart.setStudent("", "");
                setName("");
                setMobile("");
                onClose();
              }}
              style={{ flex: 1 }}
            >
              Clear
            </Button>
          )}
          <Button
            variant="primary"
            size="md"
            onPress={() => {
              cart.setStudent(name, mobile);
              onClose();
            }}
            style={{ flex: 2 }}
          >
            Save
          </Button>
        </View>
      </View>
    </BottomSheet>
  );
}

function PaymentSheet({
  visible,
  selected,
  onPick,
  onClose,
}: {
  visible: boolean;
  selected: PaymentMode;
  onPick: (m: PaymentMode) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const options: { id: PaymentMode; label: string; emoji: string; sub: string }[] = [
    { id: "cash", label: "Cash", emoji: "💵", sub: "Collect at counter" },
    { id: "upi", label: "UPI", emoji: "📱", sub: "Show BHIM QR" },
    { id: "credit", label: "Credit / Pay later", emoji: "📒", sub: "Invoice / account" },
  ];
  return (
    <BottomSheet visible={visible} title="Payment method" onClose={onClose} heightFraction={0.5}>
      <View style={{ paddingHorizontal: 20, gap: 10 }}>
        {options.map((o) => {
          const active = selected === o.id;
          return (
            <TouchableOpacity
              key={o.id}
              onPress={() => onPick(o.id)}
              activeOpacity={0.7}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                padding: 16,
                borderRadius: t.radius.md,
                borderWidth: 1,
                borderColor: active ? t.colors.primary : t.colors.border,
                backgroundColor: active ? t.colors.primarySoft : t.colors.surface,
              }}
            >
              <RNText style={{ fontSize: 24 }}>{o.emoji}</RNText>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{o.label}</Text>
                <Text variant="caption" tone="muted">
                  {o.sub}
                </Text>
              </View>
              {active && (
                <RNText style={{ color: t.colors.primary, fontSize: 18 }}>✓</RNText>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </BottomSheet>
  );
}

function PromotionDialog({
  visible,
  currentAmount,
  currentCode,
  onClose,
  onApply,
}: {
  visible: boolean;
  currentAmount: string;
  currentCode: string;
  onClose: () => void;
  onApply: (amount: string, code: string) => void;
}) {
  const [amount, setAmount] = useState(currentAmount);
  const [code, setCode] = useState(currentCode);
  useEffect(() => {
    if (visible) {
      setAmount(currentAmount);
      setCode(currentCode);
    }
  }, [visible, currentAmount, currentCode]);
  return (
    <Dialog
      visible={visible}
      title="Add promotion"
      description="Apply a flat-rupee discount, optionally tagged with a promo code. Discounts over 10% need manager PIN approval."
      onCancel={onClose}
      secondaryAction={{ label: "Cancel", onPress: onClose }}
      primaryAction={{
        label: "Apply",
        onPress: () => onApply(amount, code.toUpperCase().trim()),
      }}
    >
      <View style={{ gap: 12, marginTop: 8 }}>
        <Field
          label="Discount amount (₹)"
          value={amount}
          onChangeText={setAmount}
          placeholder="0"
          keyboardType="number-pad"
        />
        <Field
          label="Promo code (optional)"
          value={code}
          onChangeText={setCode}
          placeholder="e.g. WELCOME10"
          autoCapitalize="characters"
        />
      </View>
    </Dialog>
  );
}

function pretty(mode: string | null | undefined): string {
  if (!mode) return "";
  switch (mode) {
    case "boy":
      return "Standard";
    case "girl":
      return "Alternate";
    case "unisex":
      return "Universal";
    default:
      return mode;
  }
}
function prettyUniform(u: string | null | undefined): string {
  if (!u) return "";
  return u.charAt(0).toUpperCase() + u.slice(1);
}
function prettyPaymentMode(m: PaymentMode): string {
  switch (m) {
    case "cash":
      return "💵 Cash";
    case "upi":
      return "📱 UPI";
    case "credit":
      return "📒 Credit";
  }
}
