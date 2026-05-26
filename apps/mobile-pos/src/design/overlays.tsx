import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  TouchableOpacity,
  View,
  Text as RNText,
} from "react-native";
import { Button, FilterChip, SearchInput, Text } from "./primitives";
import { useTheme } from "./ThemeProvider";

/* ============================================================
   Dialog — center-anchored modal with title/body/actions
   ============================================================ */

export const Dialog: React.FC<{
  visible: boolean;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  onCancel: () => void;
  primaryAction?: { label: string; onPress: () => void; loading?: boolean; danger?: boolean };
  secondaryAction?: { label: string; onPress: () => void };
}> = ({ visible, title, description, children, onCancel, primaryAction, secondaryAction }) => {
  const t = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        onPress={onCancel}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.45)",
          justifyContent: "center",
          padding: t.spacing["6"],
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            {
              backgroundColor: t.colors.surface,
              borderRadius: t.radius["2xl"],
              padding: t.spacing["6"],
              gap: t.spacing["3"],
            },
            t.elevation[3],
          ]}
        >
          {title && <Text variant="heading">{title}</Text>}
          {description && (
            <Text variant="body" tone="soft">
              {description}
            </Text>
          )}
          {children}
          {(primaryAction || secondaryAction) && (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              {secondaryAction && (
                <Button
                  variant="outline"
                  size="md"
                  onPress={secondaryAction.onPress}
                  style={{ flex: 1 }}
                >
                  {secondaryAction.label}
                </Button>
              )}
              {primaryAction && (
                <Button
                  variant={primaryAction.danger ? "danger" : "primary"}
                  size="md"
                  onPress={primaryAction.onPress}
                  loading={primaryAction.loading}
                  style={{ flex: 1 }}
                >
                  {primaryAction.label}
                </Button>
              )}
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

/* ============================================================
   Prompt — Dialog + Confirm button preset (yes/no questions)
   ============================================================ */

export const Prompt: React.FC<{
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger,
  loading,
  onConfirm,
  onCancel,
}) => (
  <Dialog
    visible={visible}
    title={title}
    description={message}
    onCancel={onCancel}
    secondaryAction={{ label: cancelLabel, onPress: onCancel }}
    primaryAction={{ label: confirmLabel, onPress: onConfirm, danger, loading }}
  />
);

/* ============================================================
   BottomSheet — slides up, drag-to-dismiss, scrollable content
   ============================================================ */

export const BottomSheet: React.FC<{
  visible: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
  /**
   * Sheet height as a percentage of screen height (0–1).
   * Default 0.75 → 75% of the screen.
   */
  heightFraction?: number;
}> = ({ visible, title, onClose, children, heightFraction = 0.75 }) => {
  const t = useTheme();
  const screen = Dimensions.get("window");
  const sheetHeight = Math.round(screen.height * Math.min(1, Math.max(0.2, heightFraction)));
  const translateY = useRef(new Animated.Value(screen.height)).current;

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: visible ? 0 : screen.height,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible, screen.height, translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gs) => gs.dy > 8,
      onPanResponderMove: (_evt, gs) => {
        if (gs.dy > 0) translateY.setValue(gs.dy);
      },
      onPanResponderRelease: (_evt, gs) => {
        if (gs.dy > 120 || gs.vy > 1) {
          onClose();
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}
      >
        <Animated.View
          style={[
            {
              backgroundColor: t.colors.surface2,
              borderTopLeftRadius: t.radius["3xl"],
              borderTopRightRadius: t.radius["3xl"],
              transform: [{ translateY }],
              height: sheetHeight,
              paddingBottom: 32,
            },
            t.elevation[3],
          ]}
          onStartShouldSetResponder={() => true}
        >
          {/* Drag handle */}
          <View {...panResponder.panHandlers} style={{ paddingTop: 10, paddingBottom: 6, alignItems: "center" }}>
            <View
              style={{
                width: 44,
                height: 5,
                borderRadius: t.radius.pill,
                backgroundColor: t.colors.borderStrong,
              }}
            />
          </View>
          {title && (
            <View
              style={{
                paddingHorizontal: t.spacing["5"],
                paddingVertical: t.spacing["2"],
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text variant="heading">{title}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={10}>
                <RNText style={{ color: t.colors.muted, fontSize: 26 }}>×</RNText>
              </TouchableOpacity>
            </View>
          )}
          {children}
        </Animated.View>
      </Pressable>
    </Modal>
  );
};

/* ============================================================
   PickerSheet — BottomSheet + scrollable list of options with
   optional search. Drop-in replacement for the old MobilePicker /
   BottomSheetPicker pattern.
   ============================================================ */

export interface PickerOption {
  id: string;
  label: string;
  sub?: string;
}

export const PickerSheet: React.FC<{
  visible: boolean;
  title: string;
  options: PickerOption[];
  selectedId?: string;
  searchable?: boolean;
  onPick: (id: string) => void;
  onClose: () => void;
}> = ({ visible, title, options, selectedId, searchable, onPick, onClose }) => {
  const t = useTheme();
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!visible) setQuery("");
  }, [visible]);
  const filtered = query
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          o.sub?.toLowerCase().includes(query.toLowerCase()),
      )
    : options;
  return (
    <BottomSheet visible={visible} title={title} onClose={onClose}>
      {searchable && options.length > 5 && (
        <View style={{ paddingHorizontal: t.spacing["5"], paddingVertical: t.spacing["2"] }}>
          <SearchInput value={query} onChangeText={setQuery} placeholder="Search…" />
        </View>
      )}
      <FlatList
        data={filtered}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ paddingHorizontal: t.spacing["5"] }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const isSelected = item.id === selectedId;
          return (
            <TouchableOpacity
              onPress={() => onPick(item.id)}
              activeOpacity={0.7}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 14,
                borderBottomColor: t.colors.border,
                borderBottomWidth: 1,
              }}
            >
              <View style={{ flex: 1 }}>
                <RNText
                  style={{
                    color: isSelected ? t.colors.primary : t.colors.text,
                    fontSize: t.font.size.base,
                    fontWeight: isSelected ? "600" : "400",
                  }}
                >
                  {item.label}
                </RNText>
                {item.sub && (
                  <RNText
                    style={{ color: t.colors.muted, fontSize: t.font.size.xs, marginTop: 2 }}
                  >
                    {item.sub}
                  </RNText>
                )}
              </View>
              {isSelected && (
                <RNText style={{ color: t.colors.primary, fontSize: 18 }}>✓</RNText>
              )}
            </TouchableOpacity>
          );
        }}
      />
    </BottomSheet>
  );
};

/* ============================================================
   MultiSelectFilter — chip row that opens a sheet of toggleable options
   ============================================================ */

export const MultiSelectFilter: React.FC<{
  label: string;
  options: { id: string; label: string }[];
  selected: string[];
  onChange: (ids: string[]) => void;
}> = ({ label, options, selected, onChange }) => {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const summary =
    selected.length === 0
      ? label
      : selected.length === 1
        ? options.find((o) => o.id === selected[0])?.label ?? label
        : `${label} · ${selected.length}`;
  return (
    <>
      <FilterChip
        label={summary}
        active={selected.length > 0}
        onPress={() => setOpen(true)}
        count={selected.length || undefined}
      />
      <BottomSheet visible={open} title={label} onClose={() => setOpen(false)}>
        <View style={{ paddingHorizontal: t.spacing["5"], gap: 8 }}>
          {options.map((opt) => {
            const checked = selected.includes(opt.id);
            return (
              <TouchableOpacity
                key={opt.id}
                onPress={() =>
                  onChange(
                    checked
                      ? selected.filter((x) => x !== opt.id)
                      : [...selected, opt.id],
                  )
                }
                activeOpacity={0.7}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 14,
                  borderBottomColor: t.colors.border,
                  borderBottomWidth: 1,
                }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    borderWidth: 2,
                    borderColor: checked ? t.colors.primary : t.colors.border,
                    backgroundColor: checked ? t.colors.primary : "transparent",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 12,
                  }}
                >
                  {checked && (
                    <RNText style={{ color: t.colors.primaryFg, fontSize: 14, fontWeight: "700" }}>
                      ✓
                    </RNText>
                  )}
                </View>
                <Text variant="body">{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
          <View style={{ flexDirection: "row", gap: 8, paddingTop: 16 }}>
            <Button variant="outline" size="md" onPress={() => onChange([])} style={{ flex: 1 }}>
              Clear
            </Button>
            <Button variant="primary" size="md" onPress={() => setOpen(false)} style={{ flex: 1 }}>
              Done
            </Button>
          </View>
        </View>
      </BottomSheet>
    </>
  );
};

/* ============================================================
   DateRangeFilter — chip + sheet with quick presets + custom range
   ============================================================ */

export type DateRange = { from: string | null; to: string | null; preset?: string };

const PRESETS: { id: string; label: string; build: () => DateRange }[] = [
  {
    id: "today",
    label: "Today",
    build: () => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return { from: d.toISOString(), to: new Date().toISOString(), preset: "today" };
    },
  },
  {
    id: "yesterday",
    label: "Yesterday",
    build: () => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      d.setHours(0, 0, 0, 0);
      const e = new Date(d);
      e.setHours(23, 59, 59, 999);
      return { from: d.toISOString(), to: e.toISOString(), preset: "yesterday" };
    },
  },
  {
    id: "last7",
    label: "Last 7 days",
    build: () => {
      const e = new Date();
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return { from: d.toISOString(), to: e.toISOString(), preset: "last7" };
    },
  },
  {
    id: "last30",
    label: "Last 30 days",
    build: () => {
      const e = new Date();
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return { from: d.toISOString(), to: e.toISOString(), preset: "last30" };
    },
  },
];

export const DateRangeFilter: React.FC<{
  label?: string;
  value: DateRange;
  onChange: (v: DateRange) => void;
}> = ({ label = "Date", value, onChange }) => {
  const [open, setOpen] = useState(false);
  const summary = value.from
    ? PRESETS.find((p) => p.id === value.preset)?.label ?? "Custom range"
    : label;
  return (
    <>
      <FilterChip
        label={summary}
        active={!!value.from}
        onPress={() => setOpen(true)}
      />
      <BottomSheet visible={open} title={label} onClose={() => setOpen(false)}>
        <View style={{ paddingHorizontal: 20, gap: 8 }}>
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              variant={value.preset === p.id ? "primary" : "outline"}
              size="md"
              onPress={() => {
                onChange(p.build());
                setOpen(false);
              }}
            >
              {p.label}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="md"
            onPress={() => {
              onChange({ from: null, to: null });
              setOpen(false);
            }}
          >
            Clear date filter
          </Button>
        </View>
      </BottomSheet>
    </>
  );
};

/* ============================================================
   Toast — auto-dismissing bottom-anchored snackbar
   ============================================================ */

export interface ToastMessage {
  id: string;
  kind: "success" | "error" | "info";
  text: string;
}

export const Toast: React.FC<{
  toast: ToastMessage | null;
  onDismiss: () => void;
}> = ({ toast, onDismiss }) => {
  const t = useTheme();
  useEffect(() => {
    if (!toast) return;
    const h = setTimeout(onDismiss, 2400);
    return () => clearTimeout(h);
  }, [toast, onDismiss]);
  if (!toast) return null;
  const tone = toast.kind;
  const palette = {
    success: { bg: t.colors.successBg, fg: t.colors.successFg, prefix: "✓" },
    error: { bg: t.colors.errorBg, fg: t.colors.errorFg, prefix: "⚠️" },
    info: { bg: t.colors.activeBg, fg: t.colors.activeFg, prefix: "ℹ" },
  }[tone];
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        bottom: 32,
        left: 16,
        right: 16,
        alignItems: "center",
      }}
    >
      <View
        style={[
          {
            backgroundColor: palette.bg,
            borderRadius: t.radius.pill,
            paddingHorizontal: 18,
            paddingVertical: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            maxWidth: "100%",
          },
          t.elevation[2],
        ]}
      >
        <RNText style={{ color: palette.fg, fontSize: 14, fontWeight: "700" }}>
          {palette.prefix}
        </RNText>
        <RNText style={{ color: palette.fg, fontSize: 14, fontWeight: "600", flexShrink: 1 }}>
          {toast.text}
        </RNText>
      </View>
    </View>
  );
};
