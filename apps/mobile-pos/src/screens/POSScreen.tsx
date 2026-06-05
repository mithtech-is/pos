import React, { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  TextInput as RNTextInput,
} from "react-native";
import { buildIdempotencyKey, sanitizeNumericInput, digitsOnly, clampInt, filterBranchesForUser, INPUT_LIMITS } from "@pos/shared";
import {
  Button,
  Input,
  Panel,
  Row,
  Col,
  Title,
  Muted,
  Badge,
  inr,
  inr2,
  styles,
  ScreenScroll,
} from "../components/ui";
import { colors, radius } from "../theme";
import { useAuthStore } from "../state/auth";
import { useCartStore } from "../state/cart";
import { audit, inventory, masterData, orders, settings, syncQueue } from "../db/repositories";
import ManagerPinModal from "../components/ManagerPinModal";
import UpiQrModal from "../components/UpiQrModal";
import CameraScannerModal from "../components/CameraScannerModal";
import { Picker as MobilePicker, BottomSheetPicker } from "../components/Picker";
import { printReceipt, shareReceiptPdf } from "../receipt";
import type { ReceiptData } from "@pos/shared";

const DISCOUNT_PIN_THRESHOLD_PCT = 10;

type PaymentMode = "cash" | "upi" | "credit";

/**
 * Mobile billing screen.
 *
 * Mirrors the Electron POSPage feature-for-feature:
 *   - Top: outlet / group / type pickers + customer info
 *   - Scanner card with camera and keyboard (HID) inputs
 *   - Search results / kit suggestion / recent scans
 *   - Cart with line edits + cart-level discount (PIN-gated above 10%)
 *   - Payment mode: cash, UPI (QR modal), credit
 *   - Complete sale: writes locally, enqueues for sync, never blocks on network
 */
export default function POSScreen() {
  const user = useAuthStore((s) => s.user);
  const cart = useCartStore();

  const [schools, setSchools] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [kit, setKit] = useState<{ kit: any; items: any[] } | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [barcode, setBarcode] = useState("");
  const [scanFlash, setScanFlash] = useState<"idle" | "ok" | "miss">("idle");
  const [recentScans, setRecentScans] = useState<
    Array<{ barcode: string; name: string; size: string; price: number }>
  >([]);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [cartDiscount, setCartDiscount] = useState("");
  const [discountApprovedBy, setDiscountApprovedBy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "success" | "error"; msg: string } | null>(null);
  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null);
  const [printBusy, setPrintBusy] = useState(false);

  // Modal state
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
  const [cameraOpen, setCameraOpen] = useState(false);

  /* ----- pickers ----- */
  const [pickerOpen, setPickerOpen] = useState<null | {
    title: string;
    options: { id: string; label: string; sub?: string }[];
    onPick: (id: string) => void;
  }>(null);

  function openSchoolPicker() {
    setPickerOpen({
      title: "Select outlet",
      options: schools.map((s) => ({ id: s.id, label: s.name, sub: s.code })),
      onPick: (id) => {
        cart.setSchool(id || null);
        setPickerOpen(null);
      },
    });
  }
  function openClassPicker() {
    setPickerOpen({
      title: "Select group",
      options: classes.map((c) => ({ id: c.id, label: `Group ${c.class_name}` })),
      onPick: (id) => {
        cart.setClass(id || null);
        setPickerOpen(null);
      },
    });
  }
  function openGenderPicker() {
    setPickerOpen({
      title: "Option",
      options: [
        { id: "boy", label: "Standard" },
        { id: "girl", label: "Alternate" },
        { id: "unisex", label: "Universal" },
      ],
      onPick: (id) => {
        cart.setGender(id as any);
        setPickerOpen(null);
      },
    });
  }
  function openUniformTypePicker() {
    setPickerOpen({
      title: "Type",
      options: [
        { id: "regular", label: "Regular" },
        { id: "summer", label: "Summer" },
        { id: "winter", label: "Winter" },
        { id: "sports", label: "Sports" },
        { id: "house", label: "House" },
      ],
      onPick: (id) => {
        cart.setUniformType(id);
        setPickerOpen(null);
      },
    });
  }
  function openPaymentPicker() {
    setPickerOpen({
      title: "Payment mode",
      options: [
        { id: "cash", label: "💵 Cash" },
        { id: "upi", label: "📱 UPI (scan QR)" },
        { id: "credit", label: "📒 Credit / Pay later" },
      ],
      onPick: (id) => {
        setPaymentMode(id as PaymentMode);
        setPickerOpen(null);
      },
    });
  }

  /* ----- load master data ----- */
  // Outlets the signed-in user may sell from (managers/admins + unassigned
  // cashiers see all; an assigned cashier sees only their branches).
  useEffect(() => {
    (async () => {
      const all = (await masterData.listSchools()) ?? [];
      const visible = filterBranchesForUser(all, user);
      setSchools(visible);
      const current = useCartStore.getState().school_id;
      if (current && !visible.some((s: any) => s.id === current)) {
        cart.setSchool(null);
      } else if (!current && visible.length === 1) {
        cart.setSchool(visible[0].id);
      }
    })().catch(() => {});
  }, [user]);
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
  useEffect(() => {
    if (!search) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setResults(await masterData.searchVariants(search));
    }, 150);
    return () => clearTimeout(handle);
  }, [search]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  function showToast(kind: "success" | "error", msg: string) {
    setToast({ kind, msg });
  }
  function flashScanner(k: "ok" | "miss") {
    setScanFlash(k);
    setTimeout(() => setScanFlash("idle"), 500);
  }

  /* ----- scan handler shared between keyboard + camera ----- */
  async function processScan(rawCode: string) {
    const code = rawCode.trim();
    if (!code) return;
    const variant: any = await masterData.findByBarcode(code);
    if (!variant) {
      flashScanner("miss");
      showToast("error", `No product for "${code}" — use Search to find it`);
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
    flashScanner("ok");
    showToast(
      "success",
      `${variant.product_name} · size ${variant.size ?? "-"} · ${inr(Number(variant.price ?? 0))}`,
    );
    setRecentScans((prev) =>
      [
        {
          barcode: code,
          name: variant.product_name ?? "Item",
          size: variant.size ?? "",
          price: variant.price ?? 0,
        },
        ...prev,
      ].slice(0, 6),
    );
  }

  function addKitToCart() {
    if (!kit) return;
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
    showToast("success", `Added full kit (${kit.items.length} items)`);
  }

  /* ----- totals + discount approval ----- */
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

  function onDiscountChange(text: string) {
    setCartDiscount(sanitizeNumericInput(text, { max: INPUT_LIMITS.PRICE_MAX, decimals: true }));
    const amt = Number(text) || 0;
    if (amt <= 0) {
      setDiscountApprovedBy(null);
      return;
    }
    const pct = baseTotals.subtotal > 0 ? (amt / baseTotals.subtotal) * 100 : 0;
    if (pct <= DISCOUNT_PIN_THRESHOLD_PCT || user?.role === "manager") {
      setDiscountApprovedBy(user?.role === "manager" ? user.id : null);
      return;
    }
    // Open PIN modal — keep the text typed; clear approval until verified.
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

  /* ----- complete sale ----- */
  async function onPressCompleteSale() {
    if (!user) return;
    if (cart.lines.length === 0) {
      showToast("error", "Cart is empty");
      return;
    }
    if (!cart.school_id) {
      showToast("error", "Pick an outlet first");
      return;
    }
    // If discount over threshold and not approved, force the PIN now.
    if (
      effectiveDiscountPct > DISCOUNT_PIN_THRESHOLD_PCT &&
      !discountApprovedBy &&
      user.role !== "manager"
    ) {
      showToast("error", "Discount needs manager approval");
      return;
    }
    if (paymentMode === "upi") {
      const vpa = (await settings.get<string>("upi_vpa")) ?? "";
      if (!vpa) {
        showToast("error", "Set Merchant UPI VPA in Settings first");
        return;
      }
      const payeeName = (await settings.get<string>("upi_payee_name")) ?? "Distributor";
      const txnRef = `POS-${Date.now()}`;
      setUpiModal({
        amount: totals.grand_total,
        reference: txnRef,
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
    setMessage(null);
    try {
      for (const line of cart.lines) {
        if (line.variant_id.startsWith("manual-")) continue;
        const available = await inventory.getLocalAvailable(line.variant_id);
        if (available < line.quantity) {
          const allowNegative = (await settings.get<boolean>("allow_negative_stock")) === true;
          if (!allowNegative) {
            throw new Error(
              `Insufficient stock for ${line.product_name}: ${available} available, ${line.quantity} requested`,
            );
          }
        }
      }
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

      // Build a ReceiptData record so the cashier can print / share the
      // receipt right after the sale (and re-print from OrdersScreen later).
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
      setDiscountApprovedBy(null);
      setRecentScans([]);
    } catch (err) {
      const msg = (err as Error).message;
      setMessage(msg);
      showToast("error", msg);
    } finally {
      setBusy(false);
    }
  }

  const schoolName = schools.find((s) => s.id === cart.school_id)?.name;
  const className = classes.find((c) => c.id === cart.class_id)?.class_name;

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

  return (
    <ScreenScroll>
      {/* CONTEXT PICKERS */}
      <Panel elev>
        <Title style={{ fontSize: 18 }}>Context</Title>
        <Muted style={{ marginBottom: 10 }}>Set outlet, group, and type.</Muted>
        <Col gap={8}>
          <MobilePicker
            label="Outlet"
            value={schoolName ?? ""}
            placeholder="Select outlet..."
            onPress={openSchoolPicker}
          />
          <MobilePicker
            label="Group"
            value={className ? `Group ${className}` : ""}
            placeholder="Select group..."
            disabled={!cart.school_id}
            onPress={openClassPicker}
          />
          <Row gap={8}>
            <View style={{ flex: 1 }}>
              <MobilePicker
                label="Option"
                value={prettyGender(cart.gender)}
                onPress={openGenderPicker}
              />
            </View>
            <View style={{ flex: 1 }}>
              <MobilePicker
                label="Type"
                value={prettyUniform(cart.uniform_type)}
                onPress={openUniformTypePicker}
              />
            </View>
          </Row>
          <Input
            label="Customer name (optional)"
            value={cart.student_name}
            onChangeText={(t) => cart.setStudent(t, cart.parent_mobile)}
          />
          <Input
            label="Customer mobile"
            value={cart.parent_mobile}
            onChangeText={(t) => cart.setStudent(cart.student_name, digitsOnly(t, INPUT_LIMITS.MOBILE_DIGITS))}
            keyboardType="phone-pad"
            maxLength={INPUT_LIMITS.MOBILE_DIGITS}
          />
        </Col>
      </Panel>

      {/* SCANNER */}
      <View style={{ height: 14 }} />
      <Panel elev>
        <Row style={{ justifyContent: "space-between" }}>
          <Title style={{ fontSize: 18 }}>🔍 Scan barcode</Title>
          {scanFlash === "ok" && <Badge variant="online">✓ scanned</Badge>}
          {scanFlash === "miss" && <Badge variant="error">no match</Badge>}
        </Row>
        <Muted style={{ marginBottom: 10 }}>
          Tap the camera button or use a paired Bluetooth scanner.
        </Muted>
        <Input
          value={barcode}
          onChangeText={setBarcode}
          placeholder="Scan or type code"
          autoCapitalize="characters"
          onSubmitEditing={async () => {
            if (!barcode.trim()) return;
            const code = barcode.trim();
            setBarcode("");
            await processScan(code);
          }}
          style={{
            borderColor:
              scanFlash === "ok"
                ? colors.success
                : scanFlash === "miss"
                  ? colors.danger
                  : colors.accent,
            borderWidth: 2,
            fontFamily: "monospace",
          }}
        />
        <View style={{ height: 8 }} />
        <Button onPress={() => setCameraOpen(true)} variant="primary" style={{ width: "100%" }}>
          📷 Open camera scanner
        </Button>
      </Panel>

      {/* SEARCH */}
      <View style={{ height: 14 }} />
      <Panel elev>
        <Title style={{ fontSize: 18 }}>🔎 Search product</Title>
        <Muted style={{ marginBottom: 10 }}>
          Type product name, SKU, or barcode — tap a result to add to cart.
        </Muted>
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder="e.g. item, SKU-001, 890000..."
          autoCapitalize="none"
        />
        {search.length > 0 && results.length === 0 && (
          <Muted style={{ marginTop: 10, textAlign: "center" }}>
            No matches. Try a different keyword or scan the barcode.
          </Muted>
        )}
        {results.length > 0 && (
          <View style={{ marginTop: 8 }}>
            {results.slice(0, 12).map((r) => (
              <TouchableOpacity
                key={r.id}
                onPress={() => {
                  cart.addLine({
                    variant_id: r.id,
                    sku: r.sku,
                    product_name: r.product_name,
                    size: r.size ?? "",
                    quantity: 1,
                    unit_price: r.price ?? 0,
                    discount: 0,
                    tax_rate: 0,
                  });
                  showToast("success", `Added ${r.product_name}`);
                }}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingVertical: 12,
                  borderBottomColor: colors.border,
                  borderBottomWidth: 1,
                }}
              >
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={{ color: colors.text, fontWeight: "500" }}>{r.product_name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>
                    SKU {r.sku} · size {r.size ?? "-"}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>
                    {inr(Number(r.price ?? 0))}
                  </Text>
                  <Text style={{ color: colors.accentHover, fontSize: 11 }}>+ Add</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </Panel>

      {/* SUGGESTED KIT */}
      {kit && (
        <>
          <View style={{ height: 14 }} />
          <Panel>
            <Row style={{ justifyContent: "space-between" }}>
              <View>
                <Title style={{ fontSize: 16 }}>📦 Suggested kit</Title>
                <Muted>{kit.kit?.name}</Muted>
              </View>
              <Button onPress={addKitToCart} variant="primary">Add all</Button>
            </Row>
            <View style={{ marginTop: 10 }}>
              {kit.items.map((i: any) => (
                <Row key={i.id} style={{ justifyContent: "space-between", paddingVertical: 4 }}>
                  <Text style={{ color: colors.text, fontSize: 13 }}>
                    {i.product_name} · <Text style={{ color: colors.muted }}>size {i.size}</Text>
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    {i.quantity}× {inr(Number(i.price ?? 0))}
                  </Text>
                </Row>
              ))}
            </View>
          </Panel>
        </>
      )}

      {/* RECENT SCANS */}
      {recentScans.length > 0 && (
        <>
          <View style={{ height: 14 }} />
          <Panel>
            <Title style={{ fontSize: 16 }}>🕒 Recent scans</Title>
            <View style={{ marginTop: 6 }}>
              {recentScans.map((s, i) => (
                <Row key={i} style={{ justifyContent: "space-between", paddingVertical: 3 }}>
                  <Text style={{ color: colors.textSoft, fontFamily: "monospace", fontSize: 12 }}>
                    {s.barcode} · {s.name} {s.size}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{inr(s.price)}</Text>
                </Row>
              ))}
            </View>
          </Panel>
        </>
      )}

      {/* CART */}
      <View style={{ height: 14 }} />
      <Panel elev>
        <Row style={{ justifyContent: "space-between" }}>
          <Title style={{ fontSize: 18 }}>🛒 Cart</Title>
          <Badge>{cart.lines.length} {cart.lines.length === 1 ? "item" : "items"}</Badge>
        </Row>
        {cart.lines.length === 0 && (
          <Muted style={{ textAlign: "center", paddingVertical: 20 }}>
            Scan or pick items to start.
          </Muted>
        )}
        {cart.lines.map((l) => (
          <View
            key={l.variant_id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingVertical: 8,
              borderBottomColor: colors.border,
              borderBottomWidth: 1,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "500" }}>{l.product_name}</Text>
              <Text style={{ color: colors.muted, fontSize: 11 }}>
                size {l.size} · {inr(l.unit_price)}
              </Text>
            </View>
            <RNTextInput
              value={String(l.quantity)}
              onChangeText={(t) => cart.updateQty(l.variant_id, clampInt(t, 1, INPUT_LIMITS.QTY_MAX))}
              keyboardType="number-pad"
              maxLength={4}
              style={{
                width: 56,
                color: colors.text,
                backgroundColor: colors.bgElev1,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: radius.sm,
                textAlign: "center",
                paddingVertical: 6,
              }}
            />
            <Text
              style={{
                width: 88,
                textAlign: "right",
                color: colors.text,
                fontWeight: "500",
                fontVariant: ["tabular-nums"],
              }}
            >
              {inr2(l.quantity * l.unit_price - l.discount)}
            </Text>
            <TouchableOpacity
              onPress={() => cart.removeLine(l.variant_id)}
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
            >
              <Text style={{ color: colors.muted, fontSize: 20 }}>×</Text>
            </TouchableOpacity>
          </View>
        ))}

        {/* Totals */}
        <View style={{ marginTop: 12 }}>
          <TotalRow label="Subtotal" value={inr2(totals.subtotal)} />
          <TotalRow label="Discount" value={`− ${inr2(totals.discount_total)}`} />
          <TotalRow label="Tax" value={inr2(totals.tax_total)} />
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              borderTopColor: colors.borderStrong,
              borderTopWidth: 2,
              paddingTop: 10,
              marginTop: 6,
            }}
          >
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>Total</Text>
            <Text
              style={{
                color: colors.text,
                fontSize: 26,
                fontWeight: "700",
                fontVariant: ["tabular-nums"],
              }}
            >
              {inr2(totals.grand_total)}
            </Text>
          </View>
        </View>

        {/* Discount input */}
        <View style={{ marginTop: 14 }}>
          <Input
            label="Cart discount (₹)"
            value={cartDiscount}
            onChangeText={onDiscountChange}
            keyboardType="number-pad"
          />
          {effectiveDiscountPct > 0 && (
            <Badge
              variant={discountApprovedBy ? "online" : "offline"}
              style={{ marginTop: 6 }}
            >
              {effectiveDiscountPct.toFixed(1)}% {discountApprovedBy ? "✓ approved" : "needs approval"}
            </Badge>
          )}
          <Muted style={{ marginTop: 4, fontSize: 11 }}>
            Manager PIN required over {DISCOUNT_PIN_THRESHOLD_PCT}%
          </Muted>
        </View>

        {/* Payment mode */}
        <View style={{ marginTop: 14 }}>
          <MobilePicker
            label="Payment mode"
            value={pretty(paymentMode)}
            onPress={openPaymentPicker}
          />
        </View>

        <View style={{ height: 14 }} />
        <Button onPress={onPressCompleteSale} variant="primary" size="xl" loading={busy}>
          {paymentMode === "upi"
            ? `📱 Show UPI QR · ${inr(totals.grand_total)}`
            : `Complete sale · ${inr(totals.grand_total)}`}
        </Button>
        <Row gap={8} style={{ marginTop: 10 }}>
          <Button
            onPress={() => {
              cart.reset();
              setCartDiscount("");
              setDiscountApprovedBy(null);
            }}
            variant="ghost"
            style={{ flex: 1 }}
          >
            Clear cart
          </Button>
        </Row>

        {message && (
          <View
            style={{
              marginTop: 10,
              padding: 8,
              borderRadius: 8,
              backgroundColor: colors.dangerSoft,
            }}
          >
            <Text style={{ color: "#fecaca", fontSize: 12 }}>{message}</Text>
          </View>
        )}
      </Panel>

      {/* LAST RECEIPT — print / share / WhatsApp */}
      {lastReceipt && (
        <>
          <View style={{ height: 14 }} />
          <Panel elev>
            <Row style={{ justifyContent: "space-between" }}>
              <View>
                <Title style={{ fontSize: 16 }}>🧾 Last bill</Title>
                <Muted style={{ marginTop: 2 }}>
                  {lastReceipt.receipt_number} · {inr(lastReceipt.grand_total)}
                </Muted>
              </View>
              <Badge variant="online">✓ Sale complete</Badge>
            </Row>
            <View style={{ height: 10 }} />
            <Row gap={8}>
              <Button
                onPress={handlePrint}
                variant="primary"
                size="lg"
                loading={printBusy}
                style={{ flex: 1 }}
              >
                🖨 Print
              </Button>
              <Button
                onPress={handleShare}
                variant="ghost"
                size="lg"
                loading={printBusy}
                style={{ flex: 1 }}
              >
                📤 Share PDF
              </Button>
            </Row>
            <Muted style={{ marginTop: 8, fontSize: 11 }}>
              Print uses your system print dialog (pick a Bluetooth/Wi-Fi
              thermal printer or "Save as PDF"). Share opens WhatsApp / email
              / Gmail with the receipt PDF attached.
            </Muted>
          </Panel>
        </>
      )}

      <View style={{ height: 40 }} />

      {/* MODALS */}
      <BottomSheetPicker
        visible={!!pickerOpen}
        title={pickerOpen?.title ?? ""}
        options={pickerOpen?.options ?? []}
        searchable
        onPick={(id) => pickerOpen?.onPick(id)}
        onCancel={() => setPickerOpen(null)}
      />

      <ManagerPinModal
        visible={!!pinModal}
        action={pinModal?.action ?? "approve"}
        description={pinModal?.description}
        onApprove={(info) => pinModal?.onApprove(info)}
        onCancel={() => setPinModal(null)}
      />

      <CameraScannerModal
        visible={cameraOpen}
        onCancel={() => setCameraOpen(false)}
        onScan={(code) => {
          setCameraOpen(false);
          void processScan(code);
        }}
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

      {/* Toast */}
      {toast && (
        <View
          style={{
            position: "absolute",
            bottom: 24,
            left: 16,
            right: 16,
            backgroundColor: colors.bgElev2,
            borderColor: toast.kind === "success" ? colors.success : colors.danger,
            borderWidth: 1,
            padding: 12,
            borderRadius: radius.md,
          }}
        >
          <Text style={{ color: toast.kind === "success" ? "#d1fae5" : "#fee2e2" }}>
            {toast.kind === "success" ? "✓ " : "⚠️ "}
            {toast.msg}
          </Text>
        </View>
      )}
    </ScreenScroll>
  );
}

/* ===== helpers ===== */

const TotalRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 }}>
    <Text style={{ color: colors.muted, fontSize: 13 }}>{label}</Text>
    <Text style={{ color: colors.text, fontSize: 14, fontVariant: ["tabular-nums"] }}>{value}</Text>
  </View>
);

function pretty(mode: PaymentMode): string {
  switch (mode) {
    case "cash":
      return "💵 Cash";
    case "upi":
      return "📱 UPI (scan QR)";
    case "credit":
      return "📒 Credit / Pay later";
  }
}

function prettyGender(g: string | null | undefined): string {
  if (!g) return "";
  switch (g) {
    case "boy":
      return "Standard";
    case "girl":
      return "Alternate";
    case "unisex":
      return "Universal";
    default:
      return g;
  }
}

function prettyUniform(u: string | null | undefined): string {
  if (!u) return "";
  return u.charAt(0).toUpperCase() + u.slice(1);
}
