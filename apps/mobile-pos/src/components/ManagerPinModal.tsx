import React, { useState } from "react";
import { Modal, View, Text } from "react-native";
import { Button, Input, Panel, Row, Title, Muted } from "./ui";
import { colors, radius, spacing } from "../theme";
import { verifyManagerPin } from "../sync";

interface Props {
  visible: boolean;
  action: string;
  description?: string;
  onApprove: (info: { source: "online" | "offline"; manager_user_id?: string }) => void;
  onCancel: () => void;
}

export default function ManagerPinModal({
  visible,
  action,
  description,
  onApprove,
  onCancel,
}: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!pin) {
      setError("Enter the manager PIN");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await verifyManagerPin(pin, action);
      if (res.ok) {
        setPin("");
        onApprove({ source: res.source, manager_user_id: res.manager_user_id });
      } else {
        setError("PIN did not match any manager");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
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
          <Title>Manager approval required</Title>
          <Muted style={{ marginVertical: 8 }}>{description ?? `Action: ${action}`}</Muted>
          <Input
            label="Manager PIN"
            value={pin}
            onChangeText={setPin}
            secureTextEntry
            keyboardType="number-pad"
            autoFocus
            onSubmitEditing={submit}
          />
          {error && (
            <Text style={{ color: colors.danger, marginTop: 8, fontSize: 13 }}>{error}</Text>
          )}
          <Row style={{ marginTop: 16, justifyContent: "flex-end" }} gap={8}>
            <Button onPress={onCancel} variant="ghost">Cancel</Button>
            <Button onPress={submit} variant="primary" loading={busy}>Approve</Button>
          </Row>
        </Panel>
      </View>
    </Modal>
  );
}
