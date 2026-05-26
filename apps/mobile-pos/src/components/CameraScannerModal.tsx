import React, { useRef, useState } from "react";
import { Modal, View, Text, ActivityIndicator } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Button, Row, Title, Muted } from "./ui";
import { colors, radius, spacing } from "../theme";

interface Props {
  visible: boolean;
  onScan: (data: string) => void;
  onCancel: () => void;
}

/**
 * Camera-based barcode scanner — used on phones/tablets without a USB or
 * Bluetooth HID scanner. Detects EAN, UPC, Code 128, QR, etc. via
 * `expo-camera`. Debounces multiple reads of the same barcode (the camera
 * fires onBarcodeScanned every frame while the code is in view).
 */
export default function CameraScannerModal({ visible, onScan, onCancel }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [armed, setArmed] = useState(true);
  const lastSeen = useRef<{ data: string; at: number } | null>(null);

  function handle(data: string) {
    if (!armed) return;
    const now = Date.now();
    if (lastSeen.current && lastSeen.current.data === data && now - lastSeen.current.at < 1500) {
      return;
    }
    lastSeen.current = { data, at: now };
    setArmed(false);
    onScan(data);
    // Re-arm after a short delay so the user can scan another item without
    // closing the modal.
    setTimeout(() => setArmed(true), 800);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View
          style={{
            padding: spacing.lg,
            borderBottomWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Row style={{ justifyContent: "space-between" }}>
            <View>
              <Title>📷 Scan barcode</Title>
              <Muted>Point the camera at a uniform tag.</Muted>
            </View>
            <Button onPress={onCancel} variant="ghost">Done</Button>
          </Row>
        </View>

        <View style={{ flex: 1 }}>
          {!permission ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : !permission.granted ? (
            <View
              style={{
                flex: 1,
                padding: spacing.xl,
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
              }}
            >
              <Text style={{ color: colors.text, fontSize: 16, textAlign: "center" }}>
                Camera permission is required to scan barcodes.
              </Text>
              <Button onPress={requestPermission} variant="primary">
                Grant camera permission
              </Button>
            </View>
          ) : (
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: [
                  "qr",
                  "ean13",
                  "ean8",
                  "upc_a",
                  "upc_e",
                  "code128",
                  "code39",
                  "itf14",
                ],
              }}
              onBarcodeScanned={(e) => handle(e.data)}
            >
              {/* Aiming reticle */}
              <View pointerEvents="none" style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <View
                  style={{
                    width: 260,
                    height: 160,
                    borderColor: armed ? colors.accent : colors.success,
                    borderWidth: 3,
                    borderRadius: radius.md,
                    backgroundColor: "transparent",
                  }}
                />
                <Text style={{ color: "white", marginTop: 12 }}>
                  {armed ? "Aiming…" : "Got it ✓"}
                </Text>
              </View>
            </CameraView>
          )}
        </View>
      </View>
    </Modal>
  );
}
