import React, { useState, useEffect } from "react";
import { Modal, View, Text } from "react-native";
import { Button, Input, Panel, Row, Title, Muted } from "./ui";
import { radius, spacing } from "../theme";

interface Props {
  visible: boolean;
  /** If the user got here from a failed scan, prefill the barcode. */
  initialBarcode?: string;
  onCancel: () => void;
  onCommit: (entry: { barcode: string; name: string; size: string; price: number }) => void;
}

/**
 * Fallback line-item entry for items that don't scan or that the catalog
 * doesn't have yet. Goes into the cart as a `manual-…` variant — these are
 * skipped during local-stock checks.
 */
export default function ManualEntryModal({
  visible,
  initialBarcode,
  onCancel,
  onCommit,
}: Props) {
  const [barcode, setBarcode] = useState(initialBarcode ?? "");
  const [name, setName] = useState("");
  const [size, setSize] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setBarcode(initialBarcode ?? "");
      setName("");
      setSize("");
      setPrice("");
      setError(null);
    }
  }, [visible, initialBarcode]);

  function commit() {
    const num = Number(price);
    if (!name) return setError("Product name is required");
    if (!num || num <= 0) return setError("Price must be a positive number");
    onCommit({ barcode, name, size, price: num });
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
          <Title>Add manual item</Title>
          <Muted style={{ marginTop: 6, marginBottom: 12 }}>
            {initialBarcode
              ? `Barcode "${initialBarcode}" isn't in the catalog — add as a one-off.`
              : "Custom line item without a barcode."}
          </Muted>
          <Input
            label="Product name *"
            value={name}
            onChangeText={setName}
            autoFocus
          />
          <View style={{ height: 12 }} />
          <Row gap={12}>
            <View style={{ flex: 1 }}>
              <Input label="Size" value={size} onChangeText={setSize} />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="Price *"
                value={price}
                onChangeText={setPrice}
                keyboardType="number-pad"
              />
            </View>
          </Row>
          {error && (
            <Text style={{ color: "tomato", marginTop: 8, fontSize: 13 }}>{error}</Text>
          )}
          <Row style={{ marginTop: 14, justifyContent: "flex-end" }} gap={8}>
            <Button onPress={onCancel} variant="ghost">Cancel</Button>
            <Button onPress={commit} variant="primary">Add to cart</Button>
          </Row>
        </Panel>
      </View>
    </Modal>
  );
}
