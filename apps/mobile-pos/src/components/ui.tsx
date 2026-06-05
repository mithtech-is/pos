import React from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
  TextInputProps,
} from "react-native";
import { colors, radius, spacing, font, elevation } from "../theme";

/* ---------- Panel ---------- */
export const Panel: React.FC<{
  children: React.ReactNode;
  style?: ViewStyle;
  elev?: boolean;
}> = ({ children, style, elev }) => (
  <View
    style={[
      {
        backgroundColor: colors.panel,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.md,
        padding: spacing.lg,
      },
      elev ? elevation : null,
      style,
    ]}
  >
    {children}
  </View>
);

/* ---------- Button ---------- */
type BtnVariant = "primary" | "ghost" | "danger" | "success";
type BtnSize = "md" | "lg" | "xl";

export const Button: React.FC<{
  onPress: () => void;
  variant?: BtnVariant;
  size?: BtnSize;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  style?: ViewStyle;
  active?: boolean;
}> = ({
  onPress,
  variant = "ghost",
  size = "md",
  disabled,
  loading,
  children,
  style,
  active,
}) => {
  const padV = size === "xl" ? 14 : size === "lg" ? 12 : 9;
  const padH = size === "xl" ? 22 : size === "lg" ? 18 : 14;
  const fontSize = size === "xl" ? 17 : size === "lg" ? 15 : 14;
  const bg =
    variant === "primary" || active
      ? colors.accent
      : variant === "danger"
        ? colors.danger
        : variant === "success"
          ? colors.success
          : colors.bgElev2;
  const border = variant === "ghost" && !active ? colors.borderStrong : bg;
  const txt =
    variant === "primary" || active
      ? "#171717"
      : variant === "danger"
        ? "#fff"
        : variant === "success"
          ? "#052e16"
          : colors.text;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={[
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: 1,
          paddingVertical: padV,
          paddingHorizontal: padH,
          borderRadius: radius.sm,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={txt} />
      ) : typeof children === "string" ? (
        <Text style={{ color: txt, fontSize, fontWeight: "600" }}>{children}</Text>
      ) : (
        children
      )}
    </TouchableOpacity>
  );
};

/* ---------- Input ---------- */
export const Input: React.FC<TextInputProps & { label?: string; helper?: string }> = ({
  label,
  helper,
  style,
  ...rest
}) => (
  <View style={{ width: "100%" }}>
    {label && (
      <Text
        style={{
          color: colors.muted,
          fontSize: font.size.xs,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 4,
          fontWeight: "500",
        }}
      >
        {label}
      </Text>
    )}
    <TextInput
      placeholderTextColor={colors.muted2}
      {...rest}
      style={[
        {
          color: colors.text,
          backgroundColor: colors.bgElev1,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: radius.sm,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: font.size.md,
        },
        style,
      ]}
    />
    {helper && (
      <Text style={{ color: colors.muted, fontSize: font.size.xs, marginTop: 4 }}>
        {helper}
      </Text>
    )}
  </View>
);

/* ---------- Badge ---------- */
export const Badge: React.FC<{
  variant?: "online" | "offline" | "error" | "info" | "default";
  children: React.ReactNode;
  style?: ViewStyle;
}> = ({ variant = "default", children, style }) => {
  const palette: Record<string, { bg: string; fg: string; border: string }> = {
    online: { bg: colors.successSoft, fg: "#86efac", border: "rgba(34,197,94,0.4)" },
    offline: { bg: colors.warningSoft, fg: "#fcd34d", border: "rgba(245,158,11,0.4)" },
    error: { bg: colors.dangerSoft, fg: "#fca5a5", border: "rgba(239,68,68,0.4)" },
    info: { bg: colors.infoSoft, fg: "#67e8f9", border: "rgba(6,182,212,0.4)" },
    default: { bg: colors.bgElev2, fg: colors.text, border: colors.borderStrong },
  };
  const p = palette[variant];
  return (
    <View
      style={[
        {
          backgroundColor: p.bg,
          borderColor: p.border,
          borderWidth: 1,
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 3,
          alignSelf: "flex-start",
        },
        style,
      ]}
    >
      <Text style={{ color: p.fg, fontSize: 12, fontWeight: "500" }}>{children}</Text>
    </View>
  );
};

/* ---------- Stat card ---------- */
export const Stat: React.FC<{
  label: string;
  value: string | number;
  tone?: "success" | "warning" | "danger" | "info" | "default";
  hint?: string;
}> = ({ label, value, tone = "default", hint }) => {
  const valueColor =
    tone === "success"
      ? colors.success
      : tone === "warning"
        ? colors.warning
        : tone === "danger"
          ? colors.danger
          : tone === "info"
            ? colors.info
            : colors.text;
  return (
    <View
      style={{
        backgroundColor: colors.bgElev1,
        borderColor: colors.border,
        borderWidth: 1,
        borderRadius: radius.md,
        padding: 14,
        flex: 1,
      }}
    >
      <Text
        style={{
          color: colors.muted,
          fontSize: font.size.xs,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 4,
        }}
      >
        {label}
      </Text>
      <Text style={{ color: valueColor, fontSize: 22, fontWeight: "700" }}>{value}</Text>
      {hint && (
        <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>{hint}</Text>
      )}
    </View>
  );
};

/* ---------- Section title ---------- */
export const Title: React.FC<{ children: React.ReactNode; style?: TextStyle }> = ({
  children,
  style,
}) => (
  <Text
    style={[
      {
        color: colors.text,
        fontSize: font.size.xl,
        fontWeight: "700",
        letterSpacing: -0.4,
      },
      style,
    ]}
  >
    {children}
  </Text>
);

export const Muted: React.FC<{ children: React.ReactNode; style?: TextStyle }> = ({
  children,
  style,
}) => (
  <Text style={[{ color: colors.muted, fontSize: font.size.xs }, style]}>{children}</Text>
);

export const Row: React.FC<{
  children: React.ReactNode;
  style?: ViewStyle;
  gap?: number;
}> = ({ children, style, gap = 10 }) => (
  <View style={[{ flexDirection: "row", alignItems: "center", gap }, style]}>
    {children}
  </View>
);

export const Col: React.FC<{
  children: React.ReactNode;
  style?: ViewStyle;
  gap?: number;
}> = ({ children, style, gap = 10 }) => (
  <View style={[{ flexDirection: "column", gap }, style]}>{children}</View>
);

/* ---------- Format helpers ---------- */
export function inr(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function inr2(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollPad: {
    padding: spacing.lg,
    paddingBottom: 80,
  },
});
