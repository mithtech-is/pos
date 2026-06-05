import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildIdempotencyKey,
  computeGstBreakup,
  computePromoDiscount,
  isPromoActiveAt,
  clampInt,
  clampNumber,
  filterBranchesForUser,
  INPUT_LIMITS,
  type PosPromotion,
} from "@pos/shared";
import { useAuthStore } from "../state/auth";
import { useCartStore, type CartLine } from "../state/cart";
import ManagerPinModal from "../components/ManagerPinModal";
import UpiQrModal from "../components/UpiQrModal";

/** Discount percentage above which manager PIN is required. */
const DISCOUNT_PIN_THRESHOLD_PCT = 10;

/** A sale parked ("held") so the cashier can serve another customer and resume later. */
type HeldTicket = {
  id: string;
  label: string;
  held_at: number;
  cart_discount: number;
  school_id: string | null;
  class_id: string | null;
  gender: "boy" | "girl" | "unisex";
  uniform_type: string;
  student_name: string;
  parent_mobile: string;
  lines: CartLine[];
};

/**
 * Main POS billing screen.
 *
 * Layout follows the spec section 17.1 with a polished, scanner-first UX:
 *  - Left:   barcode scanner (always focused), product search, kit suggestion
 *  - Center: recent scans + search results
 *  - Right:  cart, discount with PIN gate, payment, complete sale
 *
 * Scanner contract:
 *   - USB scanners emulate a keyboard — they "type" the barcode and press Enter.
 *   - We keep the scanner input focused at all times so the next scan always
 *     lands there. Click anywhere else, then ~250ms later it refocuses.
 *   - Successful scan: instant cart line + green toast + pulse animation.
 *   - Failed scan: red toast telling the cashier to use Search. Cashiers can
 *     NOT hand-key arbitrary items — that would let junk / wrong-price lines
 *     into sales. Unreadable barcode -> search the catalog for the real item.
 *
 * Offline-first contract (spec section 14.1) — Complete Sale never touches
 * the network: local order number, idempotency key, save to SQLite, reduce
 * local stock, enqueue order.created, print receipt, reset.
 */
export default function POSPage() {
  const user = useAuthStore((s) => s.user);
  const cart = useCartStore();
  const [schools, setSchools] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [kit, setKit] = useState<{ kit: any; items: any[] } | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [barcode, setBarcode] = useState("");
  const [scanner, setScanner] = useState<"idle" | "ok" | "miss">("idle");
  const [recentScans, setRecentScans] = useState<
    Array<{ barcode: string; name: string; size: string; price: number; at: number }>
  >([]);
  const [toast, setToast] = useState<{ kind: "success" | "error"; msg: string } | null>(null);
  const [paymentMode, setPaymentMode] = useState<"cash" | "upi" | "credit">("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [cartDiscount, setCartDiscount] = useState(0);
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [held, setHeld] = useState<HeldTicket[]>([]);
  const [gstRate, setGstRate] = useState(0);
  const [priceIncludesTax, setPriceIncludesTax] = useState(false);
  const [hsnCode, setHsnCode] = useState("");
  const [gstin, setGstin] = useState("");
  const [customer, setCustomer] = useState<any | null>(null);
  const [redeemPoints, setRedeemPoints] = useState(0);
  const [earnRate, setEarnRate] = useState(100);
  const [promos, setPromos] = useState<PosPromotion[]>([]);
  const [couponCode, setCouponCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<PosPromotion | null>(null);
  const [promoMsg, setPromoMsg] = useState<string | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);

  // Keep the scanner input focused. Refocus ONLY when nothing else has focus
  // (active element is body / html). Stealing focus from <select> closes its
  // dropdown, and stealing from any input/textarea/button is just rude.
  useEffect(() => {
    const interval = setInterval(() => {
      if (pinModal) return;
      const active = document.activeElement;
      if (!active || active === document.body || active === document.documentElement) {
        barcodeRef.current?.focus();
      }
    }, 600);
    return () => clearInterval(interval);
  }, [pinModal]);

  // Outlets the signed-in user may sell from. Managers/admins (and cashiers
  // with no assignment) see all; an assigned cashier sees only their branches.
  useEffect(() => {
    (async () => {
      const all = (await window.pos.listSchools()) ?? [];
      const visible = filterBranchesForUser(all, user);
      setSchools(visible);
      const current = useCartStore.getState().school_id;
      if (current && !visible.some((s: any) => s.id === current)) {
        cart.setSchool(null); // drop an outlet this user is no longer allowed to use
      } else if (!current && visible.length === 1) {
        cart.setSchool(visible[0].id); // single-branch cashier: auto-select
      }
    })().catch(() => {});
  }, [user]);

  // Load any parked (held) sales persisted in local settings.
  useEffect(() => {
    (async () => {
      const saved = (await window.pos.getSetting("held_orders")) as HeldTicket[] | null;
      if (Array.isArray(saved)) setHeld(saved);
    })().catch(() => {});
  }, []);

  // Load tax / GST configuration so checkout totals + the invoice reflect it.
  useEffect(() => {
    (async () => {
      setGstRate(Number((await window.pos.getSetting("gst_rate")) ?? 0) || 0);
      setPriceIncludesTax(
        ((await window.pos.getSetting("price_includes_tax")) as boolean) ?? false,
      );
      setHsnCode(((await window.pos.getSetting("hsn_code")) as string) ?? "");
      setGstin(((await window.pos.getSetting("distributor_gstin")) as string) ?? "");
      setEarnRate(Number((await window.pos.getSetting("loyalty_rupees_per_point")) ?? 100) || 100);
    })().catch(() => {});
  }, []);

  // Loyalty: look up the customer by phone (debounced) and autofill their name.
  useEffect(() => {
    const phone = cart.parent_mobile.trim();
    if (phone.length < 6) {
      setCustomer(null);
      setRedeemPoints(0);
      return;
    }
    const h = setTimeout(async () => {
      const res = await window.pos.lookupCustomer(phone);
      if (res?.ok && res.data) {
        setCustomer(res.data);
        if (!cart.student_name && res.data.name) cart.setStudent(res.data.name, phone);
      } else {
        setCustomer(null);
      }
    }, 400);
    return () => clearTimeout(h);
  }, [cart.parent_mobile]);

  // Load promotions (cached locally for offline use).
  useEffect(() => {
    (async () => {
      const res = await window.pos.listPromotions();
      if (res?.ok && Array.isArray(res.data)) setPromos(res.data);
    })().catch(() => {});
  }, []);

  useEffect(() => {
    if (!cart.school_id) {
      setClasses([]);
      return;
    }
    (async () => setClasses(await window.pos.listClasses(cart.school_id!)))().catch(() => {});
  }, [cart.school_id]);

  useEffect(() => {
    if (!cart.school_id || !cart.class_id) {
      setKit(null);
      return;
    }
    (async () => {
      const k = await window.pos.findKitByContext({
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
      setResults(await window.pos.searchVariants(search));
    }, 150);
    return () => clearTimeout(handle);
  }, [search]);

  // Auto-dismiss toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  function showToast(kind: "success" | "error", msg: string) {
    setToast({ kind, msg });
  }

  function pulseScanner(kind: "ok" | "miss") {
    setScanner(kind);
    setTimeout(() => setScanner("idle"), 600);
  }

  async function handleBarcode(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter" || !barcode.trim()) return;
    const code = barcode.trim();
    setBarcode("");
    const variant: any = await window.pos.findByBarcode(code);
    if (!variant) {
      pulseScanner("miss");
      showToast("error", `No product matches "${code}". Use Search to find it.`);
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
    pulseScanner("ok");
    showToast(
      "success",
      `${variant.product_name} · size ${variant.size ?? "-"} · ₹${Number(variant.price ?? 0).toFixed(0)}`,
    );
    setRecentScans((prev) =>
      [
        {
          barcode: code,
          name: variant.product_name ?? "Item",
          size: variant.size ?? "",
          price: variant.price ?? 0,
          at: Date.now(),
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

  function addSearchResult(variant: any) {
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
  }

  // ---- Held / parked sales -------------------------------------------------
  function persistHeld(next: HeldTicket[]) {
    setHeld(next);
    void window.pos.setSetting({ key: "held_orders", value: next });
  }

  function holdCurrentSale() {
    if (cart.lines.length === 0) {
      showToast("error", "Nothing to hold");
      return;
    }
    const now = new Date();
    const ticket: HeldTicket = {
      id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      label:
        cart.student_name?.trim() ||
        `Ticket ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      held_at: Date.now(),
      cart_discount: cartDiscount,
      school_id: cart.school_id,
      class_id: cart.class_id,
      gender: cart.gender,
      uniform_type: cart.uniform_type,
      student_name: cart.student_name,
      parent_mobile: cart.parent_mobile,
      lines: cart.lines,
    };
    persistHeld([ticket, ...held]);
    cart.reset();
    setCartDiscount(0);
    setDiscountApprovedBy(null);
    showToast(
      "success",
      `Parked "${ticket.label}" (${ticket.lines.length} item${ticket.lines.length === 1 ? "" : "s"})`,
    );
  }

  function resumeTicket(t: HeldTicket) {
    if (cart.lines.length > 0) {
      showToast("error", "Hold or clear the current sale before resuming another");
      return;
    }
    cart.loadCart({
      school_id: t.school_id,
      class_id: t.class_id,
      gender: t.gender,
      uniform_type: t.uniform_type,
      student_name: t.student_name,
      parent_mobile: t.parent_mobile,
      lines: t.lines,
    });
    setCartDiscount(t.cart_discount || 0);
    setDiscountApprovedBy(null);
    persistHeld(held.filter((x) => x.id !== t.id));
    showToast("success", `Resumed "${t.label}"`);
  }

  function removeTicket(id: string) {
    persistHeld(held.filter((x) => x.id !== id));
  }

  // ---- Promotions ----------------------------------------------------------
  function applyCoupon() {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    const promo = promos.find((p) => p.code.toUpperCase() === code);
    if (!promo) {
      setPromoMsg(`No coupon "${code}"`);
      return;
    }
    if (!isPromoActiveAt(promo, new Date())) {
      setPromoMsg(`Coupon "${code}" is not active right now`);
      return;
    }
    const sub =
      cart.lines.reduce((s, l) => s + l.quantity * l.unit_price - l.discount, 0) - cartDiscount;
    if (promo.min_subtotal && sub < promo.min_subtotal) {
      setPromoMsg(`Needs a minimum subtotal of ₹${promo.min_subtotal}`);
      return;
    }
    const totalQty = cart.lines.reduce((s, l) => s + l.quantity, 0);
    const cheapestUnit = cart.lines.length ? Math.min(...cart.lines.map((l) => l.unit_price)) : 0;
    const disc = computePromoDiscount(promo, { subtotal: Math.max(0, sub), cheapestUnit, totalQty });
    if (disc <= 0) {
      setPromoMsg(`Coupon "${code}" gives no discount on this cart`);
      return;
    }
    setAppliedPromo(promo);
    setPromoMsg(null);
    setCouponCode("");
    showToast("success", `Coupon ${code} applied`);
  }

  function removeCoupon() {
    setAppliedPromo(null);
    setPromoMsg(null);
  }

  const totals = useMemo(() => {
    const subtotal = cart.lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
    const lineDiscounts = cart.lines.reduce((s, l) => s + l.discount, 0);
    const afterCartDisc = Math.max(0, subtotal - lineDiscounts - cartDiscount);
    const totalQty = cart.lines.reduce((s, l) => s + l.quantity, 0);
    const cheapestUnit = cart.lines.length
      ? Math.min(...cart.lines.map((l) => l.unit_price))
      : 0;
    const promoDiscount = appliedPromo
      ? computePromoDiscount(appliedPromo, { subtotal: afterCartDisc, cheapestUnit, totalQty })
      : 0;
    const afterPromo = Math.max(0, afterCartDisc - promoDiscount);
    // Redeemed points (1 pt = ₹1), capped at the balance and the payable amount.
    const redeemValue = Math.max(
      0,
      Math.min(redeemPoints, customer?.loyalty_points ?? 0, afterPromo),
    );
    const grossAfterDiscount = afterPromo - redeemValue;
    const gst = computeGstBreakup(grossAfterDiscount, gstRate, priceIncludesTax);
    return {
      subtotal,
      discount_total: lineDiscounts + cartDiscount,
      promo_discount: promoDiscount,
      promo_code: appliedPromo?.code ?? null,
      redeem_value: redeemValue,
      taxable_value: gst.taxable_value,
      tax_total: gst.gst_amount,
      cgst: gst.cgst,
      sgst: gst.sgst,
      grand_total: gst.grand_total,
    };
  }, [cart.lines, cartDiscount, gstRate, priceIncludesTax, redeemPoints, customer, appliedPromo]);

  const effectiveDiscountPct =
    totals.subtotal > 0 ? (totals.discount_total / totals.subtotal) * 100 : 0;

  function requestDiscount(amount: number) {
    if (amount <= 0) {
      setCartDiscount(0);
      setDiscountApprovedBy(null);
      return;
    }
    const subtotal = cart.lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
    const pct = subtotal > 0 ? (amount / subtotal) * 100 : 0;
    if (pct <= DISCOUNT_PIN_THRESHOLD_PCT || user?.role === "manager") {
      setCartDiscount(amount);
      setDiscountApprovedBy(user?.role === "manager" ? user.id : null);
      return;
    }
    setPinModal({
      action: "high_discount",
      description: `Apply ₹${amount.toFixed(0)} discount (${pct.toFixed(1)}%) on cart`,
      onApprove: (info) => {
        setCartDiscount(amount);
        setDiscountApprovedBy(info.manager_user_id ?? "offline-approval");
        setPinModal(null);
      },
    });
  }

  /**
   * Entry point for the Complete Sale button. For UPI we first show the QR
   * modal; once the cashier confirms the UTR we pass it as the reference
   * into the actual sale completion. Cash + Credit complete immediately.
   */
  async function onClickCompleteSale() {
    if (!user) return;
    if (cart.lines.length === 0) {
      showToast("error", "Cart is empty");
      return;
    }
    if (!cart.school_id) {
      showToast("error", "Pick an outlet first");
      return;
    }
    if (paymentMode === "upi") {
      const vpa = ((await window.pos.getSetting("upi_vpa")) as string) ?? "";
      if (!vpa) {
        showToast("error", "Set Merchant UPI VPA in Settings first");
        return;
      }
      const payeeName =
        ((await window.pos.getSetting("upi_payee_name")) as string) ??
        "Distributor";
      // Tentative reference — final local order number is allocated inside
      // completeSale(). For the QR we use a temp txn ref tied to this moment.
      const txnRef = `POS-${Date.now()}`;
      setUpiModal({
        amount: totals.grand_total,
        reference: txnRef,
        vpa,
        payeeName,
        onPaid: (utr) => {
          setPaymentReference(utr);
          setUpiModal(null);
          // Defer the sale until state has flushed.
          void completeSale(utr);
        },
      });
      return;
    }
    void completeSale(paymentReference);
  }

  async function completeSale(reference: string | null = null) {
    if (!user) return;
    if (cart.lines.length === 0) {
      showToast("error", "Cart is empty");
      return;
    }
    if (!cart.school_id) {
      showToast("error", "Pick an outlet first");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      for (const line of cart.lines) {
        const available = await window.pos.getLocalAvailable(line.variant_id);
        if (available < line.quantity) {
          const allowNegative =
            (await window.pos.getSetting("allow_negative_stock")) === true;
          if (!allowNegative) {
            throw new Error(
              `Insufficient stock for ${line.product_name}: ${available} available, ${line.quantity} requested`,
            );
          }
        }
      }

      const deviceCode =
        ((await window.pos.getSetting("device_code")) as string) ?? "POS001";
      const localOrderNumber = await window.pos.nextLocalOrderNumber({
        device_code: deviceCode,
        now: new Date().toISOString(),
      });
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

      await window.pos.createLocalOrder({
        local_order_number: localOrderNumber,
        idempotency_key: idempotencyKey,
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
        payment_reference: reference ?? paymentReference ?? null,
        items: itemsForDb,
        created_at: createdAt,
      });

      for (const line of cart.lines) {
        await window.pos.applyLocalSale({
          variant_id: line.variant_id,
          quantity: line.quantity,
        });
      }

      await window.pos.queuePush({
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
          payment_reference: reference ?? paymentReference ?? null,
          created_offline: true,
          created_at: createdAt,
          local_order_number: localOrderNumber,
          idempotency_key: idempotencyKey,
          discount_approved_by: discountApprovedBy,
          items: itemsForDb,
        },
      });

      const distributorName =
        ((await window.pos.getSetting("distributor_name")) as string) ??
        "CounterFlow Store";
      const distributorAddress =
        ((await window.pos.getSetting("distributor_address")) as string) ?? "";
      const receipt = {
        distributor_name: distributorName,
        distributor_address: distributorAddress || undefined,
        gstin: gstin || undefined,
        receipt_number: `R-${localOrderNumber}`,
        local_order_number: localOrderNumber,
        server_order_number: null,
        date_time: createdAt,
        cashier_name: user.name,
        school_name:
          schools.find((s) => s.id === cart.school_id)?.name ?? "Default",
        student_name: cart.student_name || null,
        parent_mobile: cart.parent_mobile || null,
        items: itemsForDb,
        subtotal: totals.subtotal,
        discount_total: totals.discount_total,
        tax_total: totals.tax_total,
        grand_total: totals.grand_total,
        gst_rate: gstRate || undefined,
        taxable_value: totals.taxable_value,
        cgst: totals.cgst,
        sgst: totals.sgst,
        hsn_code: hsnCode || undefined,
        price_includes_tax: priceIncludesTax,
        payment_mode: paymentMode,
        payment_reference: reference ?? paymentReference ?? null,
        sync_status: "offline_pending" as const,
        return_policy:
          "Returns accepted within 7 days with receipt. Innerwear non-returnable.",
      };
      await window.pos.renderReceipt(receipt);

      await window.pos.audit({
        user_id: user.id,
        device_id: deviceCode,
        action: "bill.created",
        data: { local_order_number: localOrderNumber, total: totals.grand_total },
      });
      // Loyalty: best-effort, online-only — the sale is already saved locally,
      // so a failure here never affects the bill.
      const loyaltyPhone = cart.parent_mobile.trim();
      if (loyaltyPhone.length >= 6) {
        void window.pos
          .awardPoints({
            phone: loyaltyPhone,
            name: cart.student_name || undefined,
            spent: totals.grand_total,
            redeem_points: totals.redeem_value,
            earn_rupees_per_point: earnRate,
          })
          .catch(() => {});
      }

      showToast("success", `Bill ${localOrderNumber} · ₹${totals.grand_total.toFixed(0)}`);
      setMessage(null);
      cart.reset();
      setCartDiscount(0);
      setDiscountApprovedBy(null);
      setRedeemPoints(0);
      setCustomer(null);
      setAppliedPromo(null);
      setCouponCode("");
      setPromoMsg(null);
    } catch (err) {
      const msg = (err as Error).message;
      setMessage(msg);
      showToast("error", msg);
    } finally {
      setBusy(false);
    }
  }

  async function printLastReceipt() {
    const last = await window.pos.lastReceipt();
    if (!last) {
      showToast("error", "No recent receipt");
      return;
    }
    await window.pos.printReceipt(last);
  }

  const schoolName = schools.find((s) => s.id === cart.school_id)?.name;

  return (
    <div>
      {/* Top context bar */}
      <div className="topbar" style={{ borderTop: "1px solid var(--border)" }}>
        <select
          value={cart.school_id ?? ""}
          onChange={(e) => cart.setSchool(e.target.value || null)}
          title={schools.length ? "Select outlet" : "No outlet assigned to your account — ask a manager"}
        >
          <option value="">
            {schools.length ? "Select outlet..." : "No outlet assigned"}
          </option>
          {schools.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
          ))}
        </select>
        <select value={cart.class_id ?? ""} onChange={(e) => cart.setClass(e.target.value || null)}>
          <option value="">Group...</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>Group {c.class_name}</option>
          ))}
        </select>
        <select value={cart.gender} onChange={(e) => cart.setGender(e.target.value as any)}>
          <option value="boy">Standard</option>
          <option value="girl">Alternate</option>
          <option value="unisex">Universal</option>
        </select>
        <select value={cart.uniform_type} onChange={(e) => cart.setUniformType(e.target.value)}>
          <option value="regular">Default</option>
          <option value="summer">Seasonal</option>
          <option value="winter">Priority</option>
          <option value="sports">Service</option>
          <option value="house">Custom</option>
        </select>
        <input
          placeholder="Customer name"
          value={cart.student_name}
          onChange={(e) => cart.setStudent(e.target.value, cart.parent_mobile)}
        />
        <input
          placeholder="Customer mobile"
          value={cart.parent_mobile}
          onChange={(e) => cart.setStudent(cart.student_name, e.target.value)}
        />
      </div>

      <div className="pos-grid">
        {/* ============== LEFT PANE ============== */}
        <div className="pos-pane">
          <div className="panel elev">
            <label style={{ display: "flex", justifyContent: "space-between" }}>
              <span>🔍 Scan barcode</span>
              <span className="muted" style={{ textTransform: "none" }}>
                Press <span className="kbd">Enter</span> after scan
              </span>
            </label>
            <input
              ref={barcodeRef}
              className={`scanner-input ${scanner === "miss" ? "" : ""}`}
              placeholder="Aim scanner here or type code…"
              value={barcode}
              autoFocus
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={handleBarcode}
              style={{
                borderColor:
                  scanner === "ok"
                    ? "var(--success)"
                    : scanner === "miss"
                      ? "var(--danger)"
                      : undefined,
              }}
            />
            <hr className="divider" />

            <label>Search product</label>
            <input
              placeholder="Type product name or SKU"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {kit && (
            <div className="panel" style={{ marginTop: 12 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <strong>Suggested bundle</strong>
                  <div className="muted">{kit.kit?.name ?? schoolName}</div>
                </div>
                <button className="primary" onClick={addKitToCart}>Add all</button>
              </div>
              <div style={{ marginTop: 10 }}>
                {kit.items.map((i: any) => (
                  <div key={i.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                    <span>{i.product_name} <span className="muted">size {i.size}</span></span>
                    <span className="muted">{i.quantity}× ₹{Number(i.price ?? 0).toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {recentScans.length > 0 && (
            <div className="panel" style={{ marginTop: 12 }}>
              <strong>🕒 Recent scans</strong>
              <div style={{ marginTop: 8 }}>
                {recentScans.map((s, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      padding: "4px 0",
                      fontSize: 12,
                      color: "var(--text-soft)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    <span>
                      {s.barcode}
                      <span style={{ color: "var(--muted)" }}> · {s.name} {s.size}</span>
                    </span>
                    <span>₹{Number(s.price).toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {held.length > 0 && (
            <div className="panel" style={{ marginTop: 12 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>⏸ Parked sales</strong>
                <span className="badge">{held.length}</span>
              </div>
              <div style={{ marginTop: 8 }}>
                {held.map((t) => {
                  const total =
                    t.lines.reduce((s, l) => s + l.quantity * l.unit_price - l.discount, 0) -
                    (t.cart_discount || 0);
                  return (
                    <div
                      key={t.id}
                      className="row"
                      style={{
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "6px 0",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          className="name"
                          style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                        >
                          {t.label}
                        </div>
                        <div className="meta">
                          {t.lines.length} item{t.lines.length === 1 ? "" : "s"} · ₹{total.toFixed(0)}
                        </div>
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        <button className="primary" onClick={() => resumeTicket(t)}>Resume</button>
                        <button className="ghost" onClick={() => removeTicket(t.id)}>×</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ============== CENTER PANE ============== */}
        <div className="pos-pane">
          <div className="panel elev">
            <strong>{search ? "Search results" : "Catalog"}</strong>
            <div className="muted">
              {search ? `${results.length} match${results.length !== 1 ? "es" : ""}` : "Scan or search to begin"}
            </div>
            <div style={{ marginTop: 12 }}>
              {results.length === 0 && !search && (
                <div className="muted" style={{ textAlign: "center", padding: "40px 0" }}>
                  <div style={{ fontSize: 40, opacity: 0.5 }}>📷</div>
                  <div style={{ marginTop: 8 }}>Use the scanner on the left or type to search.</div>
                </div>
              )}
              {results.map((r) => (
                <div key={r.id} className="product-card" onClick={() => addSearchResult(r)}>
                  <div>
                    <div className="name" style={{ fontWeight: 500 }}>{r.product_name}</div>
                    <div className="meta">SKU {r.sku} · size {r.size} · {r.gender ?? "unisex"}</div>
                  </div>
                  <div className="price">₹{Number(r.price ?? 0).toFixed(0)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ============== RIGHT PANE — CART ============== */}
        <div className="pos-pane">
          <div className="panel elev">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong style={{ fontSize: 16 }}>🛒 Cart</strong>
              <span className="badge">{cart.lines.length} {cart.lines.length === 1 ? "item" : "items"}</span>
            </div>
            <div style={{ marginTop: 8 }}>
              {cart.lines.length === 0 && (
                <div className="muted" style={{ textAlign: "center", padding: "24px 0" }}>
                  Scan or pick items to start.
                </div>
              )}
              {cart.lines.map((l) => (
                <div key={l.variant_id} className="cart-row">
                  <div>
                    <div className="name">{l.product_name}</div>
                    <div className="meta">size {l.size} · ₹{l.unit_price.toFixed(0)}</div>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={INPUT_LIMITS.QTY_MAX}
                    value={l.quantity}
                    onChange={(e) => cart.updateQty(l.variant_id, clampInt(e.target.value, 1, INPUT_LIMITS.QTY_MAX))}
                  />
                  <div className="line-total">
                    ₹{(l.quantity * l.unit_price - l.discount).toFixed(2)}
                  </div>
                  <button className="ghost" onClick={() => cart.removeLine(l.variant_id)}>×</button>
                </div>
              ))}
            </div>

            {customer && (
              <div
                style={{
                  marginTop: 10,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "var(--panel-2, #f1f1f1)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>⭐ {customer.name || "Member"}</strong>
                  <span className="badge online">{customer.loyalty_points} pts</span>
                </div>
                <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                  {customer.visits} visit{customer.visits === 1 ? "" : "s"} · ₹
                  {Number(customer.total_spent).toFixed(0)} lifetime · earns{" "}
                  {Math.floor(totals.grand_total / earnRate)} pts on this sale
                </div>
                {customer.loyalty_points > 0 && (
                  <div className="row" style={{ marginTop: 6, alignItems: "center", gap: 6 }}>
                    <label style={{ textTransform: "none", margin: 0 }}>Redeem</label>
                    <input
                      type="number"
                      min={0}
                      max={customer.loyalty_points}
                      value={redeemPoints || ""}
                      onChange={(e) =>
                        setRedeemPoints(clampInt(e.target.value, 0, customer.loyalty_points))
                      }
                      style={{ width: 90 }}
                    />
                    <span className="muted" style={{ fontSize: 11 }}>pts (₹1 each)</span>
                  </div>
                )}
              </div>
            )}

            <div style={{ marginTop: 12 }}>
              <div className="total-row"><span>Subtotal</span><span>₹{totals.subtotal.toFixed(2)}</span></div>
              <div className="total-row"><span>Discount</span><span>− ₹{totals.discount_total.toFixed(2)}</span></div>
              {totals.promo_discount > 0 && (
                <div className="total-row"><span>Coupon {totals.promo_code}</span><span>− ₹{totals.promo_discount.toFixed(2)}</span></div>
              )}
              {totals.redeem_value > 0 && (
                <div className="total-row"><span>Points redeemed</span><span>− ₹{totals.redeem_value.toFixed(2)}</span></div>
              )}
              {gstRate > 0 && (
                <>
                  <div className="total-row"><span>Taxable value</span><span>₹{totals.taxable_value.toFixed(2)}</span></div>
                  <div className="total-row"><span>CGST ({(gstRate / 2).toFixed(1)}%)</span><span>₹{totals.cgst.toFixed(2)}</span></div>
                  <div className="total-row"><span>SGST ({(gstRate / 2).toFixed(1)}%)</span><span>₹{totals.sgst.toFixed(2)}</span></div>
                </>
              )}
              <div className="total-row total-grand">
                <span>Total{priceIncludesTax && gstRate > 0 ? " (incl. GST)" : ""}</span>
                <span>₹{totals.grand_total.toFixed(2)}</span>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <label>Cart discount (₹)</label>
              <div className="row">
                <input
                  type="number"
                  min={0}
                  max={INPUT_LIMITS.PRICE_MAX}
                  step={10}
                  value={cartDiscount || ""}
                  onChange={(e) => requestDiscount(clampNumber(e.target.value, 0, INPUT_LIMITS.PRICE_MAX))}
                  placeholder="0"
                />
                {effectiveDiscountPct > 0 && (
                  <span
                    className={`badge ${discountApprovedBy ? "online" : "offline"}`}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {effectiveDiscountPct.toFixed(1)}% {discountApprovedBy ? "✓" : ""}
                  </span>
                )}
              </div>
              <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
                Manager PIN required over {DISCOUNT_PIN_THRESHOLD_PCT}%
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <label>Coupon code</label>
              {appliedPromo ? (
                <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <span className="badge online">{appliedPromo.code} applied</span>
                  <button className="ghost" onClick={removeCoupon}>Remove</button>
                </div>
              ) : (
                <div className="row">
                  <input
                    placeholder="Enter code"
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                  />
                  <button className="outline" onClick={applyCoupon}>Apply</button>
                </div>
              )}
              {promoMsg && (
                <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>{promoMsg}</div>
              )}
            </div>

            <div style={{ marginTop: 14 }}>
              <label>Payment mode</label>
              <select value={paymentMode} onChange={(e) => setPaymentMode(e.target.value as any)}>
                <option value="cash">💵 Cash</option>
                <option value="upi">📱 UPI (scan QR)</option>
                <option value="credit">📒 Credit / Pay later</option>
              </select>
              {paymentMode === "upi" && (
                <div className="muted" style={{ marginTop: 6, fontSize: 11 }}>
                  Customer scans the QR on the next screen. You'll capture the
                  UTR after they pay.
                </div>
              )}
              {paymentReference && (
                <div className="muted" style={{ marginTop: 6 }}>
                  Ref: <span className="kbd">{paymentReference}</span>
                </div>
              )}
            </div>

            <div className="col" style={{ marginTop: 14 }}>
              <button
                className="primary xl"
                disabled={busy || cart.lines.length === 0}
                onClick={onClickCompleteSale}
                style={{ justifyContent: "center" }}
              >
                {busy
                  ? "Saving…"
                  : paymentMode === "upi"
                    ? `📱 Show UPI QR · ₹${totals.grand_total.toFixed(0)}`
                    : `Complete order · ₹${totals.grand_total.toFixed(0)}`}
              </button>
              <div className="row">
                <button
                  className="ghost flex-1"
                  disabled={cart.lines.length === 0}
                  onClick={holdCurrentSale}
                  style={{ justifyContent: "center" }}
                >
                  ⏸ Hold
                </button>
                <button className="ghost flex-1" onClick={printLastReceipt} style={{ justifyContent: "center" }}>
                  🖨 Reprint
                </button>
                <button
                  className="ghost flex-1"
                  onClick={() => {
                    cart.reset();
                    setCartDiscount(0);
                    setDiscountApprovedBy(null);
                  }}
                  style={{ justifyContent: "center" }}
                >
                  Clear
                </button>
              </div>
            </div>

            {message && (
              <div
                style={{
                  marginTop: 10,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  fontSize: 12,
                }}
              >
                {message}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Manager-PIN modal */}
      {pinModal && (
        <ManagerPinModal
          action={pinModal.action}
          description={pinModal.description}
          onApprove={pinModal.onApprove}
          onCancel={() => setPinModal(null)}
        />
      )}

      {/* UPI QR modal */}
      {upiModal && (
        <UpiQrModal
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
        <div className={`toast ${toast.kind}`}>
          <span style={{ fontSize: 18 }}>{toast.kind === "success" ? "✅" : "⚠️"}</span>
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
