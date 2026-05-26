import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Cart store, persisted to AsyncStorage so an app kill / OS reboot doesn't
 * lose the cashier's in-progress sale. This matters for the offline-first
 * promise: if the network drops AND the OS kills the app to reclaim memory,
 * the cashier should still find their cart waiting when they re-open the app.
 *
 * Persistence uses AsyncStorage (not SQLite) because:
 *   • the cart is one row, not a relational dataset
 *   • zustand's `persist` middleware integrates seamlessly with it
 *   • SQLite is reserved for orders + sync queue (the durable record)
 */

export interface CartLine {
  variant_id: string;
  sku: string;
  product_name: string;
  size: string;
  quantity: number;
  unit_price: number;
  discount: number;
  tax_rate: number;
}

interface CartState {
  school_id: string | null;
  class_id: string | null;
  gender: "boy" | "girl" | "unisex";
  uniform_type: string;
  student_name: string;
  parent_mobile: string;
  lines: CartLine[];

  setSchool: (id: string | null) => void;
  setClass: (id: string | null) => void;
  setGender: (g: "boy" | "girl" | "unisex") => void;
  setUniformType: (t: string) => void;
  setStudent: (name: string, mobile: string) => void;

  addLine: (line: CartLine) => void;
  updateQty: (variantId: string, qty: number) => void;
  removeLine: (variantId: string) => void;
  reset: () => void;

  totals: () => {
    subtotal: number;
    discount_total: number;
    tax_total: number;
    grand_total: number;
  };
}

const initial = {
  school_id: null,
  class_id: null,
  gender: "boy" as const,
  uniform_type: "regular",
  student_name: "",
  parent_mobile: "",
  lines: [] as CartLine[],
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      ...initial,
      setSchool: (school_id) => set({ school_id, class_id: null }),
      setClass: (class_id) => set({ class_id }),
      setGender: (gender) => set({ gender }),
      setUniformType: (uniform_type) => set({ uniform_type }),
      setStudent: (student_name, parent_mobile) => set({ student_name, parent_mobile }),

      addLine: (line) =>
        set((state) => {
          const existing = state.lines.find((l) => l.variant_id === line.variant_id);
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                l.variant_id === line.variant_id
                  ? { ...l, quantity: l.quantity + line.quantity }
                  : l,
              ),
            };
          }
          return { lines: [...state.lines, line] };
        }),
      updateQty: (variantId, qty) =>
        set((state) => ({
          lines: state.lines
            .map((l) => (l.variant_id === variantId ? { ...l, quantity: qty } : l))
            .filter((l) => l.quantity > 0),
        })),
      removeLine: (variantId) =>
        set((state) => ({
          lines: state.lines.filter((l) => l.variant_id !== variantId),
        })),
      reset: () => set(initial),

      totals: () => {
        const lines = get().lines;
        let subtotal = 0;
        let discount_total = 0;
        let tax_total = 0;
        for (const l of lines) {
          const line_subtotal = l.quantity * l.unit_price;
          const taxable = Math.max(0, line_subtotal - l.discount);
          subtotal += line_subtotal;
          discount_total += l.discount;
          tax_total += taxable * (l.tax_rate ?? 0);
        }
        const grand_total = subtotal - discount_total + tax_total;
        return { subtotal, discount_total, tax_total, grand_total };
      },
    }),
    {
      name: "pos-cart-v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        // Only persist the data, not the methods.
        school_id: s.school_id,
        class_id: s.class_id,
        gender: s.gender,
        uniform_type: s.uniform_type,
        student_name: s.student_name,
        parent_mobile: s.parent_mobile,
        lines: s.lines,
      }),
    },
  ),
);
