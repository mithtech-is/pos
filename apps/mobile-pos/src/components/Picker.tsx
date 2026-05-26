import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  FlatList,
  TextInput,
  Pressable,
  Dimensions,
} from "react-native";
import { colors, font, radius, spacing, elevation } from "../theme";

export interface PickerOption {
  id: string;
  label: string;
  sub?: string;
  icon?: string;
}

/**
 * Tappable "select" affordance for mobile. Looks like a labelled input with a
 * chevron, opens a bottom-sheet of options when tapped. Built from scratch
 * because RN's stock `Picker` is platform-specific and ugly.
 */
export const Picker: React.FC<{
  label: string;
  value: string;
  placeholder?: string;
  onPress: () => void;
  disabled?: boolean;
}> = ({ label, value, placeholder, onPress, disabled }) => {
  const hasValue = !!value && value !== placeholder;
  return (
    <View>
      <Text
        style={{
          color: colors.muted,
          fontSize: font.size.xs,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 6,
          fontWeight: "500",
        }}
      >
        {label}
      </Text>
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.7}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: colors.bgElev1,
          borderColor: colors.borderStrong,
          borderWidth: 1,
          borderRadius: radius.sm,
          paddingVertical: 14,
          paddingHorizontal: 14,
          opacity: disabled ? 0.5 : 1,
          minHeight: 48,
        }}
      >
        <Text
          style={{
            color: hasValue ? colors.text : colors.muted,
            fontSize: 15,
            flex: 1,
            marginRight: 8,
          }}
          numberOfLines={1}
        >
          {value || placeholder || "Select…"}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>▼</Text>
      </TouchableOpacity>
    </View>
  );
};

interface BottomSheetProps {
  visible: boolean;
  title: string;
  options: PickerOption[];
  selectedId?: string;
  searchable?: boolean;
  onPick: (id: string) => void;
  onCancel: () => void;
}

/**
 * Bottom-sheet style picker modal. Slides up from the bottom, takes ~70% of
 * the screen, supports search for long lists.
 */
export const BottomSheetPicker: React.FC<BottomSheetProps> = ({
  visible,
  title,
  options,
  selectedId,
  searchable,
  onPick,
  onCancel,
}) => {
  const [query, setQuery] = React.useState("");
  const screenHeight = Dimensions.get("window").height;

  React.useEffect(() => {
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
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.55)",
          justifyContent: "flex-end",
        }}
        onPress={onCancel}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            {
              backgroundColor: colors.panel,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingTop: 8,
              paddingHorizontal: spacing.lg,
              paddingBottom: spacing.xl,
              maxHeight: screenHeight * 0.75,
            },
            elevation,
          ]}
        >
          {/* Drag handle */}
          <View
            style={{
              alignSelf: "center",
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.borderStrong,
              marginBottom: 12,
            }}
          />
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <Text
              style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}
            >
              {title}
            </Text>
            <TouchableOpacity onPress={onCancel} hitSlop={10}>
              <Text style={{ color: colors.muted, fontSize: 26 }}>×</Text>
            </TouchableOpacity>
          </View>

          {searchable && options.length > 6 && (
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search…"
              placeholderTextColor={colors.muted2}
              style={{
                backgroundColor: colors.bgElev1,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: radius.sm,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: colors.text,
                marginBottom: 12,
                fontSize: 14,
              }}
              autoCapitalize="none"
            />
          )}

          <FlatList
            data={filtered}
            keyExtractor={(o) => o.id}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => (
              <View style={{ height: 1, backgroundColor: colors.border }} />
            )}
            ListEmptyComponent={
              <Text
                style={{ color: colors.muted, textAlign: "center", padding: 16 }}
              >
                No matches.
              </Text>
            }
            renderItem={({ item }) => {
              const isSelected = item.id === selectedId;
              return (
                <TouchableOpacity
                  onPress={() => onPick(item.id)}
                  activeOpacity={0.65}
                  style={{
                    paddingVertical: 16,
                    paddingHorizontal: 4,
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: isSelected ? colors.accentSoft : "transparent",
                    borderRadius: radius.sm,
                  }}
                >
                  {item.icon && (
                    <Text style={{ fontSize: 20, marginRight: 10 }}>
                      {item.icon}
                    </Text>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: isSelected ? colors.accentHover : colors.text,
                        fontSize: 16,
                        fontWeight: isSelected ? "600" : "400",
                      }}
                    >
                      {item.label}
                    </Text>
                    {item.sub && (
                      <Text
                        style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}
                      >
                        {item.sub}
                      </Text>
                    )}
                  </View>
                  {isSelected && (
                    <Text style={{ color: colors.accentHover, fontSize: 16 }}>
                      ✓
                    </Text>
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
};
