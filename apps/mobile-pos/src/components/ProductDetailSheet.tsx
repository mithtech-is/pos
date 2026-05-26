import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, TouchableOpacity, View, Text as RNText } from "react-native";
import {
  BottomSheet,
  Button,
  QuantityPicker,
  Text,
  inr,
  useTheme,
} from "../design";
import { masterData } from "../db/repositories";
import { useCartStore } from "../state/cart";

interface Props {
  visible: boolean;
  productId: string | null;
  onClose: () => void;
  /** Optional callback after a successful add — caller can show a toast. */
  onAdded?: (label: string) => void;
}

interface Variant {
  id: string;
  product_name: string;
  sku: string;
  size: string | null;
  color: string | null;
  fabric: string | null;
  gender: string | null;
  price: number;
  tax_rate: number;
}

/**
 * Bottom-sheet detail view for a single product. Lists every active variant
 * as a chip grid (one chip per size+color combo), lets the cashier pick one
 * and pick a quantity, then drops the chosen variant into the cart.
 *
 * Loads variants lazily on `visible` — only the tap pays the SQLite read.
 */
export default function ProductDetailSheet({
  visible,
  productId,
  onClose,
  onAdded,
}: Props) {
  const t = useTheme();
  const cart = useCartStore();
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!visible || !productId) {
      return;
    }
    setQty(1);
    setSelectedId(null);
    (async () => {
      const list = await masterData.listVariantsForProduct(productId);
      setVariants(list);
      if (list.length === 1) setSelectedId(list[0].id);
    })().catch(() => setVariants([]));
  }, [visible, productId]);

  const selected = useMemo(
    () => variants.find((v) => v.id === selectedId) ?? null,
    [variants, selectedId],
  );

  // Unique sizes / colors so we can render two separate chip rows (Agilo
  // pattern). When the product has neither, the chip block is hidden.
  const sizes = useMemo(
    () =>
      Array.from(new Set(variants.map((v) => v.size).filter(Boolean) as string[])),
    [variants],
  );
  const colors = useMemo(
    () =>
      Array.from(new Set(variants.map((v) => v.color).filter(Boolean) as string[])),
    [variants],
  );

  const productName = variants[0]?.product_name ?? "Product";

  function pickBySize(size: string) {
    const candidate = variants.find((v) => v.size === size);
    if (candidate) setSelectedId(candidate.id);
  }

  function pickByColor(color: string) {
    if (!selected) {
      const candidate = variants.find((v) => v.color === color);
      if (candidate) setSelectedId(candidate.id);
      return;
    }
    const candidate = variants.find(
      (v) => v.color === color && v.size === selected.size,
    );
    if (candidate) setSelectedId(candidate.id);
  }

  function addToCart() {
    if (!selected) return;
    cart.addLine({
      variant_id: selected.id,
      sku: selected.sku,
      product_name: selected.product_name,
      size: selected.size ?? "",
      quantity: qty,
      unit_price: selected.price,
      discount: 0,
      tax_rate: selected.tax_rate ?? 0,
    });
    onAdded?.(`${selected.product_name}${selected.size ? ` · ${selected.size}` : ""}`);
    onClose();
  }

  return (
    <BottomSheet visible={visible} title={productName} onClose={onClose} heightFraction={0.8}>
      <ScrollView
        style={{ paddingHorizontal: 20 }}
        contentContainerStyle={{ paddingBottom: 24, gap: 16 }}
      >
        {/* Hero image placeholder */}
        <View
          style={{
            height: 200,
            borderRadius: t.radius.xl,
            backgroundColor: t.colors.surface3,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <RNText style={{ fontSize: 64, opacity: 0.35 }}>👕</RNText>
        </View>

        {/* Price */}
        <View>
          <Text variant="caption" tone="muted">
            Price
          </Text>
          <Text variant="title" style={{ marginTop: 4 }}>
            {selected ? inr(selected.price) : "Select an option"}
          </Text>
        </View>

        {sizes.length > 0 && (
          <View>
            <Text variant="label" tone="muted" style={{ marginBottom: 8 }}>
              SIZE
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {sizes.map((s) => {
                const isActive = selected?.size === s;
                return (
                  <TouchableOpacity
                    key={s}
                    onPress={() => pickBySize(s)}
                    activeOpacity={0.7}
                    style={{
                      minWidth: 56,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: t.radius.md,
                      borderWidth: 1,
                      borderColor: isActive ? t.colors.primary : t.colors.border,
                      backgroundColor: isActive ? t.colors.primary : t.colors.surface,
                      alignItems: "center",
                    }}
                  >
                    <RNText
                      style={{
                        color: isActive ? t.colors.primaryFg : t.colors.text,
                        fontSize: 14,
                        fontWeight: "600",
                      }}
                    >
                      {s}
                    </RNText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {colors.length > 0 && (
          <View>
            <Text variant="label" tone="muted" style={{ marginBottom: 8 }}>
              COLOR
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {colors.map((c) => {
                const isActive = selected?.color === c;
                return (
                  <TouchableOpacity
                    key={c}
                    onPress={() => pickByColor(c)}
                    activeOpacity={0.7}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: t.radius.md,
                      borderWidth: 1,
                      borderColor: isActive ? t.colors.primary : t.colors.border,
                      backgroundColor: isActive ? t.colors.primary : t.colors.surface,
                    }}
                  >
                    <RNText
                      style={{
                        color: isActive ? t.colors.primaryFg : t.colors.text,
                        fontSize: 14,
                        fontWeight: "600",
                      }}
                    >
                      {c}
                    </RNText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        <View>
          <Text variant="label" tone="muted" style={{ marginBottom: 8 }}>
            QUANTITY
          </Text>
          <QuantityPicker value={qty} onChange={setQty} min={1} max={50} />
        </View>

        {selected && (
          <View
            style={{
              backgroundColor: t.colors.surface3,
              borderRadius: t.radius.md,
              padding: 12,
            }}
          >
            <Text variant="caption" tone="muted">
              SKU
            </Text>
            <Text variant="mono" style={{ marginTop: 2 }}>
              {selected.sku}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Sticky action bar */}
      <View
        style={{
          paddingHorizontal: 20,
          paddingTop: 12,
          borderTopColor: t.colors.border,
          borderTopWidth: 1,
        }}
      >
        <Button
          variant="primary"
          size="xl"
          onPress={addToCart}
          disabled={!selected}
          full
        >
          {selected
            ? `Add to cart · ${inr(selected.price * qty)}`
            : "Pick a variant"}
        </Button>
      </View>
    </BottomSheet>
  );
}
