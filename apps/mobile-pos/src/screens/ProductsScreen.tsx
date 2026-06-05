import React, { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  RefreshControl,
  TouchableOpacity,
  View,
  Text as RNText,
} from "react-native";
import {
  Layout,
  SearchInput,
  Skeleton,
  Text,
  Toast,
  ToastMessage,
  inr,
  useTheme,
} from "../design";
import { TopBar } from "../navigation/TopBar";
import { masterData } from "../db/repositories";
import ProductDetailSheet from "../components/ProductDetailSheet";

/**
 * Products tab — Agilo-style grid. One tile per product, tapping a tile opens
 * a BottomSheet with size / color / qty pickers + "Add to cart" CTA.
 *
 * Reads `masterData.listProducts()` directly so it works fully offline —
 * the sync worker keeps the local product table fresh; the tab never needs
 * the network on its own.
 *
 * Search is debounced 180ms and runs through the same SQL helper.
 */

interface ProductRow {
  id: string;
  name: string;
  category: string | null;
  school_id: string | null;
  uniform_type: string | null;
  min_price: number;
  max_price: number;
  variant_count: number;
  school_name: string | null;
}

export default function ProductsScreen() {
  const t = useTheme();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeProduct, setActiveProduct] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const load = useCallback(async () => {
    const list = await masterData.listProducts({ query: query.trim() || undefined });
    setItems(list);
    setLoading(false);
    setRefreshing(false);
  }, [query]);

  useEffect(() => {
    setLoading(true);
    const h = setTimeout(load, 180);
    return () => clearTimeout(h);
  }, [query, load]);

  function priceLabel(p: ProductRow): string {
    if (p.min_price === p.max_price) return inr(p.min_price);
    return `${inr(p.min_price)} — ${inr(p.max_price)}`;
  }

  return (
    <Layout edges={["top"]} padded>
      <TopBar title="Products" />
      <View style={{ paddingTop: 4, paddingBottom: 12 }}>
        <Text variant="title">Products</Text>
        <Text variant="caption" tone="muted" style={{ marginTop: 4 }}>
          Tap a product to choose size and add to cart.
        </Text>
      </View>
      <View style={{ marginBottom: 12 }}>
        <SearchInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search products…"
        />
      </View>
      {loading ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={{ width: "48%" }}>
              <Skeleton height={140} radius={t.radius.lg} />
              <Skeleton width="70%" height={14} style={{ marginTop: 8 }} />
              <Skeleton width="40%" height={12} style={{ marginTop: 4 }} />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={items}
          numColumns={2}
          keyExtractor={(p) => p.id}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{ gap: 12, paddingBottom: 80 }}
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
              <RNText style={{ color: t.colors.muted, fontSize: 14 }}>
                {query ? `No products match "${query}"` : "No products available."}
              </RNText>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => setActiveProduct(item.id)}
              style={{
                flex: 1,
                backgroundColor: t.colors.surface,
                borderColor: t.colors.border,
                borderWidth: 1,
                borderRadius: t.radius.lg,
                padding: 10,
              }}
            >
              <View
                style={{
                  height: 130,
                  borderRadius: t.radius.md,
                  backgroundColor: t.colors.surface3,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 10,
                }}
              >
                <RNText style={{ fontSize: 40, opacity: 0.4 }}>👕</RNText>
              </View>
              <Text variant="body" numberOfLines={2}>
                {item.name}
              </Text>
              <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
                {item.variant_count} {item.variant_count === 1 ? "variant" : "variants"}
              </Text>
              <Text variant="bodyStrong" style={{ marginTop: 6 }}>
                {priceLabel(item)}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}
      <ProductDetailSheet
        visible={!!activeProduct}
        productId={activeProduct}
        onClose={() => setActiveProduct(null)}
        onAdded={(label) =>
          setToast({ id: String(Date.now()), kind: "success", text: `Added ${label}` })
        }
      />
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Layout>
  );
}
