import React, { useState } from "react";
import { Modal, View, Text, Linking } from "react-native";
// react-native-qrcode-svg ships types written against pre-React-19 JSX. Cast
// to a permissive component type so it remains a valid JSX element under
// React 19's stricter typings.
import QRCodeRaw from "react-native-qrcode-svg";
const QRCode = QRCodeRaw as unknown as React.ComponentType<any>;
import { Button, Input, Panel, Row, Title, Muted, inr2 } from "./ui";
import { colors, radius, spacing } from "../theme";

interface Props {
  visible: boolean;
  amount: number;
  reference: string;
  vpa: string;
  payeeName: string;
  onPaid: (utr: string) => void;
  onCancel: () => void;
}

/**
 * Build a BHIM UPI deep link (per NPCI spec).
 *   upi://pay?pa=<vpa>&pn=<payee>&am=<amount>&cu=INR&tn=<note>&tr=<ref>
 */
export function buildUpiDeepLink(args: {
  vpa: string;
  payeeName: string;
  amount: number;
  reference: string;
  note?: string;
}): string {
  const params = new URLSearchParams({
    pa: args.vpa,
    pn: args.payeeName,
    am: args.amount.toFixed(2),
    cu: "INR",
    tn: args.note ?? `Bill ${args.reference}`,
    tr: args.reference,
  });
  return `upi://pay?${params.toString()}`;
}

export default function UpiQrModal({
  visible,
  amount,
  reference,
  vpa,
  payeeName,
  onPaid,
  onCancel,
}: Props) {
  const [utr, setUtr] = useState("");
  const [error, setError] = useState<string | null>(null);

  const deepLink = vpa
    ? buildUpiDeepLink({ vpa, payeeName, amount, reference, note: `Order ${reference}` })
    : "";

  function submit() {
    if (!utr.trim()) {
      setError("Enter the UTR / transaction id");
      return;
    }
    setError(null);
    const captured = utr.trim();
    setUtr("");
    onPaid(captured);
  }

  /**
   * Open the cashier's own UPI app — useful when the cashier wants to pay
   * from their phone instead of showing the QR to the customer. The Android
   * intent picker opens; on iOS this will only succeed if a UPI app is
   * registered to handle the upi:// scheme.
   */
  function openLocally() {
    if (!deepLink) return;
    Linking.openURL(deepLink).catch(() => setError("No UPI app installed to handle this link."));
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.7)",
          padding: spacing.lg,
          justifyContent: "center",
        }}
      >
        <Panel elev style={{ borderRadius: radius.md }}>
          <Title>📱 UPI payment — {inr2(amount)}</Title>
          <Muted style={{ marginTop: 6, marginBottom: 12 }}>
            Show this QR to the customer. They scan with any UPI app
            (GPay / PhonePe / Paytm / BHIM), tap Pay, then read out the UTR.
          </Muted>
          {!vpa ? (
            <Text style={{ color: colors.danger, padding: spacing.lg, textAlign: "center" }}>
              Set Merchant UPI VPA in Settings first.
            </Text>
          ) : (
            <View
              style={{
                backgroundColor: "white",
                padding: 14,
                borderRadius: 12,
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <QRCode value={deepLink} size={240} backgroundColor="white" color="#000000" />
            </View>
          )}
          {!!deepLink && (
            <Text
              style={{
                color: colors.muted,
                fontSize: 10,
                fontFamily: "monospace",
                marginBottom: 12,
              }}
              numberOfLines={2}
            >
              {deepLink}
            </Text>
          )}
          <Input
            label="UTR / Transaction id"
            value={utr}
            onChangeText={setUtr}
            placeholder="e.g. 401234567890"
            keyboardType="number-pad"
            onSubmitEditing={submit}
          />
          {error && (
            <Text style={{ color: colors.danger, marginTop: 8, fontSize: 13 }}>{error}</Text>
          )}
          <Row style={{ marginTop: 14, justifyContent: "space-between" }} gap={8}>
            <Button onPress={onCancel} variant="ghost">Cancel</Button>
            <Row gap={8}>
              <Button onPress={openLocally} variant="ghost">Open in UPI app</Button>
              <Button onPress={() => onPaid("MANUAL-NO-UTR")} variant="ghost">Skip UTR</Button>
              <Button onPress={submit} variant="primary">Mark paid</Button>
            </Row>
          </Row>
        </Panel>
      </View>
    </Modal>
  );
}
