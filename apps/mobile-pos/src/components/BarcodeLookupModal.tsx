import React, { useState, useEffect } from "react";
import { Modal, View, Text, ActivityIndicator } from "react-native";
import { Button, Input, Panel, Row, Title, Muted } from "./ui";
import { radius, spacing } from "../theme";

interface Props {
  visible: boolean;
  /** Prefill when the user arrived from a failed camera scan. */
  initialBarcode?: string;
  /** True while the parent is doing the catalog lookup. */
  busy?: boolean;
  /** Lookup error to display (e.g. "not in catalog"). */
  error?: string | null;
  onCancel: () => void;
  /** Parent resolves this against the catalog — NO free-form name/price here. */
  onSubmit: (barcode: string) => void;
}

/**
 * Barcode-only fallback for when the camera can't read a label (damaged, blurry,
 * curved). The typed code is looked up in the catalog exactly like a scan — it
 * can ONLY add a product that already exists. There is deliberately no way to
 * type a custom name/price, so a cashier can't push junk items into a sale.
 */
export default function BarcodeLookupModal({
  visible,
  initialBarcode,
  busy,
  error,
  onCancel,
  onSubmit,
}: Props) {
  const [barcode, setBarcode] = useState(initialBarcode ?? "");

  useEffect(() => {
    if (visible) setBarcode(initialBarcode ?? "");
  }, [visible, initialBarcode]);

  function submit() {
    const code = barcode.trim();
    if (!code) return;
    onSubmit(code);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
          padding: spacing.lg,
          justifyContent: "center",
        }}
      >
        <Panel elev style={{ borderRadius: radius.md }}>
          <Title>Enter barcode</Title>
          <Muted style={{ marginTop: 6, marginBottom: 12 }}>
            Type the barcode digits if the camera can't read the label. The code is
            looked up in the catalog — if it isn't found, use Search instead.
          </Muted>
          <Input
            label="Barcode / SKU"
            value={barcode}
            onChangeText={setBarcode}
            autoFocus
            autoCapitalize="characters"
            onSubmitEditing={submit}
          />
          {error && (
            <Text style={{ color: "tomato", marginTop: 8, fontSize: 13 }}>{error}</Text>
          )}
          <Row style={{ marginTop: 14, justifyContent: "flex-end", alignItems: "center" }} gap={8}>
            {busy && <ActivityIndicator style={{ marginRight: 4 }} />}
            <Button onPress={onCancel} variant="ghost">Cancel</Button>
            <Button onPress={submit} variant="primary">Look up</Button>
          </Row>
        </Panel>
      </View>
    </Modal>
  );
}
