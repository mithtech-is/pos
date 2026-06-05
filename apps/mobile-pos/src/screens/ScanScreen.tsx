import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, TouchableOpacity, View, Text as RNText } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, Text, inr, useTheme } from "../design";
import { useCartStore } from "../state/cart";
import { masterData } from "../db/repositories";
import ManualEntryModal from "../components/ManualEntryModal";

/**
 * Scan tab — full-screen camera with reticle + torch + haptics, matching the
 * Agilo reference. The tab bar is hidden while this tab is focused (configured
 * in AppTabs.tsx).
 *
 *   ╔══════════════════════════════════════════════════╗
 *   ║  ✕                                        ⚡      ║   (top bar)
 *   ║                                                  ║
 *   ║              ┏━━━━━━━━━━━━━━┓                    ║
 *   ║              ┃              ┃                    ║   (256×256 reticle
 *   ║              ┃              ┃                    ║    with 4 rounded
 *   ║              ┃              ┃                    ║    corner brackets)
 *   ║              ┗━━━━━━━━━━━━━━┛                    ║
 *   ║          Point at a barcode                       ║
 *   ║                                                  ║
 *   ║    [ Type code manually ]                         ║
 *   ╚══════════════════════════════════════════════════╝
 *
 * Successful scan → haptics, look up via masterData, drop into cart, navigate
 * to Cart tab. Miss → red error pill, haptics, manual-entry fallback option.
 */
export default function ScanScreen() {
  const t = useTheme();
  const nav = useNavigation<any>();
  const cart = useCartStore();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState<{ barcode: string } | null>(null);
  const [armed, setArmed] = useState(true);
  const lastSeen = useRef<{ data: string; at: number } | null>(null);

  // Re-arm scanner every time the tab regains focus so consecutive scans work.
  useFocusEffect(
    useCallback(() => {
      setArmed(true);
      setError(null);
      return () => {
        setTorch(false);
      };
    }, []),
  );

  // Auto-clear error pill after a short delay.
  useEffect(() => {
    if (!error) return;
    const h = setTimeout(() => setError(null), 2400);
    return () => clearTimeout(h);
  }, [error]);

  async function handleBarcode(data: string) {
    if (!armed || busy) return;
    const now = Date.now();
    if (lastSeen.current && lastSeen.current.data === data && now - lastSeen.current.at < 1800) {
      return;
    }
    lastSeen.current = { data, at: now };
    setArmed(false);
    setBusy(true);
    try {
      const variant: any = await masterData.findByBarcode(data);
      if (!variant) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setError(`No product for "${data}"`);
        setManualOpen({ barcode: data });
        return;
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
      // Drop the user back into the Cart tab so they see the added line.
      nav.getParent()?.navigate("Cart");
    } catch (err) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setError((err as Error).message);
    } finally {
      setBusy(false);
      // Re-arm shortly so a second scan still works.
      setTimeout(() => setArmed(true), 1200);
    }
  }

  function commitManualEntry(entry: { barcode: string; name: string; size: string; price: number }) {
    const id = `manual-${Date.now()}`;
    cart.addLine({
      variant_id: id,
      sku: entry.barcode || `MANUAL-${id.slice(-6)}`,
      product_name: entry.name,
      size: entry.size,
      quantity: 1,
      unit_price: entry.price,
      discount: 0,
      tax_rate: 0,
    });
    setManualOpen(null);
    nav.getParent()?.navigate("Cart");
  }

  /* ── permission states ── */
  if (!permission) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#fff" />
      </SafeAreaView>
    );
  }
  if (!permission.granted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg, padding: 24 }}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
          <RNText style={{ fontSize: 48 }}>📷</RNText>
          <Text variant="heading" align="center">
            Camera permission needed
          </Text>
          <Text variant="body" tone="soft" align="center">
            Grant camera access to scan product barcodes.
          </Text>
          <View style={{ height: 8 }} />
          <Button variant="primary" size="lg" onPress={requestPermission} full>
            Grant camera permission
          </Button>
          <Button variant="outline" size="md" onPress={() => nav.navigate("Cart")} full>
            Cancel
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{
          barcodeTypes: [
            "qr",
            "ean13",
            "ean8",
            "upc_a",
            "upc_e",
            "code128",
            "code93",
            "code39",
            "itf14",
            "pdf417",
          ],
        }}
        onBarcodeScanned={(e) => handleBarcode(e.data)}
      >
        {/* ── Top bar ── */}
        <SafeAreaView edges={["top"]} style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              padding: 16,
            }}
          >
            <TouchableOpacity
              onPress={() => nav.navigate("Cart")}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: "rgba(0,0,0,0.5)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <RNText style={{ color: "white", fontSize: 22, fontWeight: "600" }}>✕</RNText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setTorch((v) => !v)}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: torch ? "white" : "rgba(0,0,0,0.5)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <RNText style={{ fontSize: 20 }}>{torch ? "⚡" : "🔦"}</RNText>
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        {/* ── Dark overlay + cut-out reticle ── */}
        <View
          pointerEvents="none"
          style={{
            ...StyleSheetAbsoluteFill,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View style={{ width: 256, height: 256, position: "relative" }}>
            {/* 4 corner brackets */}
            <Corner pos="tl" />
            <Corner pos="tr" />
            <Corner pos="bl" />
            <Corner pos="br" />
          </View>
          <RNText
            style={{
              color: "white",
              marginTop: 20,
              fontSize: 15,
              fontWeight: "600",
              textShadowColor: "rgba(0,0,0,0.6)",
              textShadowRadius: 4,
            }}
          >
            Point at a barcode
          </RNText>
        </View>

        {/* ── Searching pill ── */}
        {busy && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              bottom: 160,
              left: 0,
              right: 0,
              alignItems: "center",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                backgroundColor: "white",
                borderRadius: 999,
                paddingVertical: 8,
                paddingHorizontal: 16,
              }}
            >
              <ActivityIndicator color="#282828" size="small" />
              <RNText style={{ color: "#282828", fontWeight: "600" }}>Searching…</RNText>
            </View>
          </View>
        )}

        {/* ── Error pill (tap to dismiss) ── */}
        {error && (
          <TouchableOpacity
            onPress={() => setError(null)}
            activeOpacity={0.8}
            style={{
              position: "absolute",
              bottom: 160,
              left: 24,
              right: 24,
              alignItems: "center",
            }}
          >
            <View
              style={{
                backgroundColor: "#F14747",
                borderRadius: 999,
                paddingVertical: 10,
                paddingHorizontal: 18,
                maxWidth: "100%",
              }}
            >
              <RNText style={{ color: "white", fontWeight: "600", fontSize: 13 }}>
                ⚠️ {error} · tap to dismiss
              </RNText>
            </View>
          </TouchableOpacity>
        )}

        {/* ── Bottom action: manual entry ── */}
        <SafeAreaView
          edges={["bottom"]}
          style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}
        >
          <View style={{ padding: 20 }}>
            <TouchableOpacity
              onPress={() => setManualOpen({ barcode: "" })}
              style={{
                backgroundColor: "rgba(255,255,255,0.95)",
                borderRadius: 999,
                paddingVertical: 14,
                alignItems: "center",
              }}
            >
              <RNText style={{ color: "#282828", fontWeight: "600", fontSize: 14 }}>
                ✏️  Type code manually
              </RNText>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </CameraView>

      <ManualEntryModal
        visible={!!manualOpen}
        initialBarcode={manualOpen?.barcode}
        onCancel={() => setManualOpen(null)}
        onCommit={commitManualEntry}
      />
    </View>
  );
}

/* ── Corner bracket — 28px L-shape for the reticle ── */
function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const size = 28;
  const thickness = 4;
  const color = "white";
  const radius = 6;
  const base = {
    position: "absolute" as const,
    width: size,
    height: size,
    borderColor: color,
  };
  switch (pos) {
    case "tl":
      return (
        <View
          style={{
            ...base,
            top: 0,
            left: 0,
            borderTopWidth: thickness,
            borderLeftWidth: thickness,
            borderTopLeftRadius: radius,
          }}
        />
      );
    case "tr":
      return (
        <View
          style={{
            ...base,
            top: 0,
            right: 0,
            borderTopWidth: thickness,
            borderRightWidth: thickness,
            borderTopRightRadius: radius,
          }}
        />
      );
    case "bl":
      return (
        <View
          style={{
            ...base,
            bottom: 0,
            left: 0,
            borderBottomWidth: thickness,
            borderLeftWidth: thickness,
            borderBottomLeftRadius: radius,
          }}
        />
      );
    case "br":
      return (
        <View
          style={{
            ...base,
            bottom: 0,
            right: 0,
            borderBottomWidth: thickness,
            borderRightWidth: thickness,
            borderBottomRightRadius: radius,
          }}
        />
      );
  }
}

const StyleSheetAbsoluteFill = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};
