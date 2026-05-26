import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  TextInputProps,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "./ThemeProvider";

/* ============================================================
   Text — semantic typography primitive
   ============================================================ */

type TextVariant =
  | "display"
  | "title"
  | "heading"
  | "body"
  | "bodyStrong"
  | "label"
  | "caption"
  | "mono";

export const Text: React.FC<{
  children: React.ReactNode;
  variant?: TextVariant;
  tone?: "default" | "soft" | "muted" | "primary" | "danger" | "success";
  numberOfLines?: number;
  style?: TextStyle;
  align?: "left" | "center" | "right";
}> = ({ children, variant = "body", tone = "default", numberOfLines, style, align }) => {
  const t = useTheme();
  const sizeMap: Record<TextVariant, { size: number; weight: TextStyle["fontWeight"]; lh?: number }> = {
    display: { size: t.font.size["4xl"], weight: "700", lh: 44 },
    title: { size: t.font.size["3xl"], weight: "700", lh: 38 },
    heading: { size: t.font.size.xl, weight: "600", lh: 28 },
    body: { size: t.font.size.base, weight: "400", lh: 20 },
    bodyStrong: { size: t.font.size.base, weight: "600", lh: 20 },
    label: { size: t.font.size.sm, weight: "500", lh: 16 },
    caption: { size: t.font.size.xs, weight: "400", lh: 14 },
    mono: { size: t.font.size.sm, weight: "400", lh: 18 },
  };
  const toneMap = {
    default: t.colors.text,
    soft: t.colors.textSoft,
    muted: t.colors.muted,
    primary: t.colors.primary,
    danger: t.colors.errorFg,
    success: t.colors.successFg,
  };
  const cfg = sizeMap[variant];
  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[
        {
          color: toneMap[tone],
          fontSize: cfg.size,
          fontWeight: cfg.weight,
          lineHeight: cfg.lh,
          textAlign: align,
          fontFamily: variant === "mono" ? "monospace" : undefined,
        },
        style,
      ]}
    >
      {children}
    </RNText>
  );
};

/* ============================================================
   Button — primary / outline / ghost / danger; sizes sm/md/lg/xl
   ============================================================ */

type BtnVariant = "primary" | "outline" | "ghost" | "danger";
type BtnSize = "sm" | "md" | "lg" | "xl";

export const Button: React.FC<{
  onPress: () => void;
  variant?: BtnVariant;
  size?: BtnSize;
  disabled?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  full?: boolean;
  children: React.ReactNode;
  style?: ViewStyle;
}> = ({
  onPress,
  variant = "primary",
  size = "md",
  disabled,
  loading,
  leftIcon,
  rightIcon,
  full,
  children,
  style,
}) => {
  const t = useTheme();
  const sizing = {
    sm: { padV: 8, padH: 12, font: t.font.size.sm, radius: t.radius.md, gap: 6, minH: 36 },
    md: { padV: 12, padH: 16, font: t.font.size.base, radius: t.radius.md, gap: 8, minH: 44 },
    lg: { padV: 14, padH: 18, font: t.font.size.md, radius: t.radius.lg, gap: 8, minH: 50 },
    xl: { padV: 16, padH: 22, font: t.font.size.lg, radius: t.radius.lg, gap: 10, minH: 56 },
  }[size];

  const palette = (() => {
    switch (variant) {
      case "primary":
        return { bg: t.colors.primary, border: t.colors.primary, fg: t.colors.primaryFg };
      case "outline":
        return { bg: "transparent", border: t.colors.borderStrong, fg: t.colors.text };
      case "ghost":
        return { bg: "transparent", border: "transparent", fg: t.colors.text };
      case "danger":
        return { bg: t.colors.errorFg, border: t.colors.errorFg, fg: "#fff" };
    }
  })();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      android_ripple={{ color: t.mode === "light" ? "#00000010" : "#ffffff10" }}
      style={({ pressed }) => [
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          borderWidth: 1,
          paddingVertical: sizing.padV,
          paddingHorizontal: sizing.padH,
          borderRadius: sizing.radius,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: sizing.gap,
          minHeight: sizing.minH,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: full ? "stretch" : "auto",
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {leftIcon}
          {typeof children === "string" ? (
            <RNText
              style={{
                color: palette.fg,
                fontSize: sizing.font,
                fontWeight: "600",
              }}
            >
              {children}
            </RNText>
          ) : (
            children
          )}
          {rightIcon}
        </>
      )}
    </Pressable>
  );
};

/* ============================================================
   Layout — full-screen scaffold with safe areas + scroll variant
   ============================================================ */

export const Layout: React.FC<{
  children: React.ReactNode;
  padded?: boolean;
  edges?: ("top" | "bottom")[];
  style?: ViewStyle;
}> = ({ children, padded = true, edges = ["top", "bottom"], style }) => {
  const t = useTheme();
  return (
    <SafeAreaView
      edges={edges}
      style={[
        { flex: 1, backgroundColor: t.colors.bg },
        padded ? { paddingHorizontal: t.spacing["4"] } : null,
        style,
      ]}
    >
      {children}
    </SafeAreaView>
  );
};

export const LayoutWithScroll: React.FC<{
  children: React.ReactNode;
  padded?: boolean;
  edges?: ("top" | "bottom")[];
  refreshControl?: any;
  contentStyle?: ViewStyle;
}> = ({ children, padded = true, edges = ["top", "bottom"], refreshControl, contentStyle }) => {
  const t = useTheme();
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl}
        contentContainerStyle={[
          padded
            ? { paddingHorizontal: t.spacing["4"], paddingBottom: t.spacing["12"] }
            : { paddingBottom: t.spacing["12"] },
          contentStyle,
        ]}
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
};

/* ============================================================
   Surface / Card — rounded rectangle with optional elevation
   ============================================================ */

export const Card: React.FC<{
  children: React.ReactNode;
  style?: ViewStyle;
  elev?: 0 | 1 | 2 | 3;
  pressable?: boolean;
  onPress?: () => void;
}> = ({ children, style, elev = 0, pressable, onPress }) => {
  const t = useTheme();
  const base: ViewStyle = {
    backgroundColor: t.colors.surface,
    borderColor: t.colors.border,
    borderWidth: 1,
    borderRadius: t.radius.lg,
    padding: t.spacing["4"],
  };
  const shadow = elev === 0 ? undefined : t.elevation[elev];
  if (pressable && onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          base,
          shadow,
          pressed ? { opacity: 0.85 } : null,
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[base, shadow, style]}>{children}</View>;
};

/* ============================================================
   StatusPill — tri-color (success/warning/error/active/neutral)
   ============================================================ */

export type PillTone = "success" | "warning" | "error" | "active" | "neutral";

export const StatusPill: React.FC<{
  tone: PillTone;
  children: React.ReactNode;
  icon?: React.ReactNode;
  size?: "sm" | "md";
}> = ({ tone, children, icon, size = "md" }) => {
  const t = useTheme();
  const bgMap = {
    success: t.colors.successBg,
    warning: t.colors.warningBg,
    error: t.colors.errorBg,
    active: t.colors.activeBg,
    neutral: t.colors.neutralBg,
  };
  const fgMap = {
    success: t.colors.successFg,
    warning: t.colors.warningFg,
    error: t.colors.errorFg,
    active: t.colors.activeFg,
    neutral: t.colors.neutralFg,
  };
  const sz =
    size === "sm"
      ? { padV: 3, padH: 8, font: t.font.size.xs }
      : { padV: 5, padH: 12, font: t.font.size.sm };
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: bgMap[tone],
        paddingVertical: sz.padV,
        paddingHorizontal: sz.padH,
        borderRadius: t.radius.pill,
        alignSelf: "flex-start",
      }}
    >
      {icon}
      <RNText style={{ color: fgMap[tone], fontSize: sz.font, fontWeight: "600" }}>
        {children}
      </RNText>
    </View>
  );
};

/* ============================================================
   SearchInput — leading icon + clear button
   ============================================================ */

export const SearchInput: React.FC<TextInputProps & { onClear?: () => void }> = ({
  value,
  onChangeText,
  onClear,
  placeholder = "Search…",
  ...rest
}) => {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: t.colors.surface3,
        borderRadius: t.radius.pill,
        paddingHorizontal: 14,
        height: 44,
        gap: 8,
      }}
    >
      <RNText style={{ color: t.colors.muted, fontSize: 16 }}>🔎</RNText>
      <RNTextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.colors.muted2}
        style={{
          flex: 1,
          color: t.colors.text,
          fontSize: t.font.size.base,
          paddingVertical: 0,
        }}
        {...rest}
      />
      {!!value && (
        <TouchableOpacity
          onPress={() => {
            onClear ? onClear() : onChangeText?.("");
          }}
          hitSlop={10}
        >
          <RNText style={{ color: t.colors.muted, fontSize: 18 }}>×</RNText>
        </TouchableOpacity>
      )}
    </View>
  );
};

/* ============================================================
   Field — labelled text input
   ============================================================ */

export const Field: React.FC<
  TextInputProps & { label?: string; helper?: string; error?: string }
> = ({ label, helper, error, style, ...rest }) => {
  const t = useTheme();
  return (
    <View style={{ width: "100%" }}>
      {label && (
        <RNText
          style={{
            color: t.colors.muted,
            fontSize: t.font.size.xs,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            marginBottom: 6,
            fontWeight: "600",
          }}
        >
          {label}
        </RNText>
      )}
      <RNTextInput
        placeholderTextColor={t.colors.muted2}
        {...rest}
        style={[
          {
            color: t.colors.text,
            backgroundColor: t.colors.surface3,
            borderColor: error ? t.colors.errorFg : t.colors.border,
            borderWidth: 1,
            borderRadius: t.radius.md,
            paddingHorizontal: 14,
            paddingVertical: 12,
            fontSize: t.font.size.base,
            minHeight: 48,
          },
          style,
        ]}
      />
      {(helper || error) && (
        <RNText
          style={{
            color: error ? t.colors.errorFg : t.colors.muted,
            fontSize: t.font.size.xs,
            marginTop: 6,
          }}
        >
          {error ?? helper}
        </RNText>
      )}
    </View>
  );
};

/* ============================================================
   QuantityPicker — −  N  + with disabled bounds
   ============================================================ */

export const QuantityPicker: React.FC<{
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}> = ({ value, onChange, min = 0, max = 999 }) => {
  const t = useTheme();
  const canDec = value > min;
  const canInc = value < max;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: t.colors.border,
        borderRadius: t.radius.pill,
        height: 32,
      }}
    >
      <TouchableOpacity
        onPress={() => canDec && onChange(value - 1)}
        disabled={!canDec}
        style={{
          paddingHorizontal: 12,
          opacity: canDec ? 1 : 0.4,
          height: "100%",
          justifyContent: "center",
        }}
      >
        <RNText style={{ color: t.colors.text, fontSize: 18, fontWeight: "600" }}>−</RNText>
      </TouchableOpacity>
      <RNText
        style={{
          color: t.colors.text,
          fontSize: t.font.size.base,
          fontWeight: "600",
          minWidth: 24,
          textAlign: "center",
        }}
      >
        {value}
      </RNText>
      <TouchableOpacity
        onPress={() => canInc && onChange(value + 1)}
        disabled={!canInc}
        style={{
          paddingHorizontal: 12,
          opacity: canInc ? 1 : 0.4,
          height: "100%",
          justifyContent: "center",
        }}
      >
        <RNText style={{ color: t.colors.text, fontSize: 18, fontWeight: "600" }}>+</RNText>
      </TouchableOpacity>
    </View>
  );
};

/* ============================================================
   FilterChip — toggleable pill used in MultiSelectFilter rows
   ============================================================ */

export const FilterChip: React.FC<{
  label: string;
  active?: boolean;
  onPress: () => void;
  count?: number;
}> = ({ label, active, onPress, count }) => {
  const t = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: active ? t.colors.primary : t.colors.surface,
        borderColor: active ? t.colors.primary : t.colors.border,
        borderWidth: 1,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: t.radius.pill,
        minHeight: 36,
      }}
    >
      <RNText
        style={{
          color: active ? t.colors.primaryFg : t.colors.text,
          fontSize: t.font.size.sm,
          fontWeight: "500",
        }}
      >
        {label}
      </RNText>
      {typeof count === "number" && count > 0 && (
        <View
          style={{
            backgroundColor: active ? t.colors.primaryFg : t.colors.primary,
            borderRadius: t.radius.pill,
            paddingHorizontal: 6,
            minWidth: 18,
            alignItems: "center",
          }}
        >
          <RNText
            style={{
              color: active ? t.colors.primary : t.colors.primaryFg,
              fontSize: 11,
              fontWeight: "700",
            }}
          >
            {count}
          </RNText>
        </View>
      )}
    </TouchableOpacity>
  );
};

/* ============================================================
   Divider — hairline
   ============================================================ */

export const Divider: React.FC<{ style?: ViewStyle }> = ({ style }) => {
  const t = useTheme();
  return (
    <View
      style={[{ height: StyleSheet.hairlineWidth, backgroundColor: t.colors.border }, style]}
    />
  );
};

/* ============================================================
   Skeleton — pulsing placeholder block
   ============================================================ */

export const Skeleton: React.FC<{
  width?: number | string;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}> = ({ width = "100%", height = 16, radius: r, style }) => {
  const t = useTheme();
  return (
    <View
      style={[
        {
          width: width as any,
          height,
          backgroundColor: t.colors.surface3,
          borderRadius: r ?? t.radius.sm,
          opacity: 0.7,
        },
        style,
      ]}
    />
  );
};

/* ============================================================
   Header — title + back + right action (light theme top bar)
   ============================================================ */

export const Header: React.FC<{
  title?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
}> = ({ title, left, right }) => {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: insets.top,
        backgroundColor: t.colors.bg,
        borderBottomColor: t.colors.border,
        borderBottomWidth: StyleSheet.hairlineWidth,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: t.spacing["3"],
          height: 52,
          gap: 8,
        }}
      >
        <View style={{ width: 60 }}>{left}</View>
        <RNText
          numberOfLines={1}
          style={{
            flex: 1,
            color: t.colors.text,
            fontSize: t.font.size.md,
            fontWeight: "600",
            textAlign: "center",
          }}
        >
          {title}
        </RNText>
        <View style={{ width: 60, alignItems: "flex-end" }}>{right}</View>
      </View>
    </View>
  );
};

/* ============================================================
   Currency formatter — INR aware
   ============================================================ */

export function inr(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function inr2(n: number): string {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
}
