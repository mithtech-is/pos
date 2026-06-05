import { describe, it, expect, beforeEach } from "vitest";
import {
  buildIdempotencyKey,
  buildLocalOrderNumber,
  computeLocalAvailable,
  computeGstBreakup,
  computePromoDiscount,
  isPromoActiveAt,
} from "@pos/shared";
import { useCartStore, type CartLine } from "../state/cart";

/**
 * Unit + regression suite for the POS core logic that the demo depends on:
 *  - offline order identity (idempotency key + local order number)
 *  - local available-stock math
 *  - cart operations + billing totals (subtotal / discount / tax / grand)
 */

describe("shared/offline-order helpers", () => {
  it("buildIdempotencyKey joins device + local order id", () => {
    expect(buildIdempotencyKey("POS001", "POS001-20260604-0001")).toBe(
      "POS001:POS001-20260604-0001",
    );
  });

  it("buildLocalOrderNumber zero-pads date + sequence", () => {
    // 2026-06-04, sequence 7 -> POS001-20260604-0007
    const d = new Date(2026, 5, 4, 10, 0, 0); // month is 0-indexed (5 = June)
    expect(buildLocalOrderNumber("POS001", d, 7)).toBe("POS001-20260604-0007");
  });

  it("buildLocalOrderNumber pads single-digit month/day", () => {
    const d = new Date(2026, 0, 9, 0, 0, 0); // 2026-01-09
    expect(buildLocalOrderNumber("CF1", d, 1)).toBe("CF1-20260109-0001");
  });
});

describe("computeLocalAvailable", () => {
  it("subtracts unsynced sales, adds returns + adjustments", () => {
    // 100 in stock, 10 sold offline, 2 returned, 5 adjusted up => 97
    expect(computeLocalAvailable(100, 10, 2, 5)).toBe(97);
  });

  it("can go negative when oversold offline", () => {
    expect(computeLocalAvailable(3, 5, 0, 0)).toBe(-2);
  });
});

describe("computeGstBreakup", () => {
  it("zero rate => no tax, grand = gross", () => {
    expect(computeGstBreakup(1000, 0, false)).toEqual({
      taxable_value: 1000, gst_amount: 0, cgst: 0, sgst: 0, grand_total: 1000,
    });
  });

  it("tax-exclusive: GST added on top, split CGST/SGST", () => {
    // 1000 @ 18% exclusive -> tax 180 (90 + 90), grand 1180
    const b = computeGstBreakup(1000, 18, false);
    expect(b.taxable_value).toBe(1000);
    expect(b.gst_amount).toBeCloseTo(180, 6);
    expect(b.cgst).toBeCloseTo(90, 6);
    expect(b.sgst).toBeCloseTo(90, 6);
    expect(b.grand_total).toBeCloseTo(1180, 6);
  });

  it("tax-inclusive (MRP): tax backed out, grand unchanged", () => {
    // 1180 incl 18% -> taxable 1000, tax 180, grand stays 1180
    const b = computeGstBreakup(1180, 18, true);
    expect(b.taxable_value).toBeCloseTo(1000, 6);
    expect(b.gst_amount).toBeCloseTo(180, 6);
    expect(b.cgst).toBeCloseTo(90, 6);
    expect(b.grand_total).toBe(1180);
  });

  it("clamps negative gross to zero", () => {
    expect(computeGstBreakup(-50, 18, false).grand_total).toBe(0);
  });
});

describe("computePromoDiscount", () => {
  const base = { id: "p", code: "X", active: true } as any;
  it("percent off subtotal", () => {
    expect(
      computePromoDiscount({ ...base, type: "percent", value: 10 }, { subtotal: 1000, cheapestUnit: 100, totalQty: 3 }),
    ).toBeCloseTo(100, 6);
  });
  it("flat off, capped at subtotal", () => {
    expect(computePromoDiscount({ ...base, type: "flat", value: 200 }, { subtotal: 1000, cheapestUnit: 100, totalQty: 2 })).toBe(200);
    expect(computePromoDiscount({ ...base, type: "flat", value: 5000 }, { subtotal: 1000, cheapestUnit: 100, totalQty: 2 })).toBe(1000);
  });
  it("bogo frees cheapest unit when >= 2 items", () => {
    expect(computePromoDiscount({ ...base, type: "bogo", value: 0 }, { subtotal: 1000, cheapestUnit: 199, totalQty: 2 })).toBe(199);
    expect(computePromoDiscount({ ...base, type: "bogo", value: 0 }, { subtotal: 1000, cheapestUnit: 199, totalQty: 1 })).toBe(0);
  });
  it("respects min_subtotal and inactive flag", () => {
    expect(
      computePromoDiscount({ ...base, type: "percent", value: 10, min_subtotal: 2000 }, { subtotal: 1000, cheapestUnit: 100, totalQty: 2 }),
    ).toBe(0);
    expect(
      computePromoDiscount({ ...base, active: false, type: "percent", value: 10 }, { subtotal: 1000, cheapestUnit: 100, totalQty: 2 }),
    ).toBe(0);
  });
});

describe("isPromoActiveAt", () => {
  const p = (over: any) => ({ id: "p", code: "X", type: "flat", value: 10, active: true, ...over } as any);
  const now = new Date("2026-06-05T10:00:00Z");
  it("active with no validity window", () => expect(isPromoActiveAt(p({}), now)).toBe(true));
  it("not yet started", () => expect(isPromoActiveAt(p({ starts_at: "2026-07-01T00:00:00Z" }), now)).toBe(false));
  it("already ended", () => expect(isPromoActiveAt(p({ ends_at: "2026-06-01T00:00:00Z" }), now)).toBe(false));
  it("inactive flag", () => expect(isPromoActiveAt(p({ active: false }), now)).toBe(false));
});

describe("cart store: operations", () => {
  beforeEach(() => useCartStore.getState().reset());

  const line = (over: Partial<CartLine> = {}): CartLine => ({
    variant_id: "v1",
    sku: "CF-TEE-M",
    product_name: "Classic T-Shirt",
    size: "M",
    quantity: 1,
    unit_price: 499,
    discount: 0,
    tax_rate: 0,
    ...over,
  });

  it("adds a line", () => {
    useCartStore.getState().addLine(line());
    expect(useCartStore.getState().lines).toHaveLength(1);
  });

  it("merges quantity when the same variant is scanned again", () => {
    const c = useCartStore.getState();
    c.addLine(line({ quantity: 1 }));
    c.addLine(line({ quantity: 2 }));
    const lines = useCartStore.getState().lines;
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(3);
  });

  it("removes a line when quantity is set to 0", () => {
    const c = useCartStore.getState();
    c.addLine(line());
    c.updateQty("v1", 0);
    expect(useCartStore.getState().lines).toHaveLength(0);
  });

  it("removeLine drops the line", () => {
    const c = useCartStore.getState();
    c.addLine(line());
    c.removeLine("v1");
    expect(useCartStore.getState().lines).toHaveLength(0);
  });
});

describe("cart store: billing totals", () => {
  beforeEach(() => useCartStore.getState().reset());

  it("computes subtotal, tax and grand total (no discount)", () => {
    useCartStore.getState().addLine({
      variant_id: "v1",
      sku: "X",
      product_name: "Item",
      size: "M",
      quantity: 2,
      unit_price: 100,
      discount: 0,
      tax_rate: 0.05,
    });
    const t = useCartStore.getState().totals();
    expect(t.subtotal).toBe(200);
    expect(t.discount_total).toBe(0);
    expect(t.tax_total).toBe(10); // 200 * 5%
    expect(t.grand_total).toBe(210);
  });

  it("applies discount before tax", () => {
    useCartStore.getState().addLine({
      variant_id: "v1",
      sku: "X",
      product_name: "Item",
      size: "M",
      quantity: 2,
      unit_price: 100,
      discount: 20,
      tax_rate: 0.05,
    });
    const t = useCartStore.getState().totals();
    expect(t.subtotal).toBe(200);
    expect(t.discount_total).toBe(20);
    expect(t.tax_total).toBe(9); // (200 - 20) * 5%
    expect(t.grand_total).toBe(189); // 200 - 20 + 9
  });

  it("sums multiple lines", () => {
    const c = useCartStore.getState();
    c.addLine({ variant_id: "a", sku: "A", product_name: "A", size: "-", quantity: 1, unit_price: 499, discount: 0, tax_rate: 0 });
    c.addLine({ variant_id: "b", sku: "B", product_name: "B", size: "-", quantity: 3, unit_price: 199, discount: 0, tax_rate: 0 });
    const t = useCartStore.getState().totals();
    expect(t.subtotal).toBe(499 + 597);
    expect(t.grand_total).toBe(1096);
  });

  it("empty cart totals are all zero", () => {
    const t = useCartStore.getState().totals();
    expect(t).toEqual({ subtotal: 0, discount_total: 0, tax_total: 0, grand_total: 0 });
  });
});
