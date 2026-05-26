import React, { useRef } from "react";
import { Animated, PanResponder, View, ViewStyle, TouchableOpacity, Text as RNText } from "react-native";
import { useTheme } from "./ThemeProvider";

/**
 * SwipeableListItem — drag-left to reveal a destructive action button.
 *
 * Uses RN's built-in Animated + PanResponder so we don't have to wire
 * react-native-gesture-handler's Swipeable, which needs GestureHandlerRootView
 * at the root (which we're not currently using app-wide).
 *
 * The right-side action snaps open at -76px reveal; drag past -150 to commit
 * the destructive action directly.
 */

const ACTION_WIDTH = 76;
const COMMIT_THRESHOLD = -150;

export const SwipeableListItem: React.FC<{
  children: React.ReactNode;
  onDelete?: () => void;
  rightLabel?: string;
  style?: ViewStyle;
}> = ({ children, onDelete, rightLabel = "Delete", style }) => {
  const t = useTheme();
  const translateX = useRef(new Animated.Value(0)).current;
  const offset = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gs) =>
        Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy),
      onPanResponderMove: (_evt, gs) => {
        const next = Math.min(0, offset.current + gs.dx);
        translateX.setValue(next);
      },
      onPanResponderRelease: (_evt, gs) => {
        const projected = offset.current + gs.dx;
        if (projected < COMMIT_THRESHOLD) {
          // Fly out and trigger onDelete.
          Animated.timing(translateX, {
            toValue: -500,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            onDelete?.();
            offset.current = 0;
            translateX.setValue(0);
          });
          return;
        }
        if (projected < -ACTION_WIDTH / 2) {
          // Snap open.
          Animated.spring(translateX, {
            toValue: -ACTION_WIDTH,
            useNativeDriver: true,
          }).start();
          offset.current = -ACTION_WIDTH;
        } else {
          // Snap closed.
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
          offset.current = 0;
        }
      },
    }),
  ).current;

  function commitDelete() {
    Animated.timing(translateX, {
      toValue: -500,
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      onDelete?.();
      offset.current = 0;
      translateX.setValue(0);
    });
  }

  return (
    <View style={[{ position: "relative" }, style]}>
      {/* Action layer (sits behind, revealed by drag) */}
      <View
        pointerEvents={onDelete ? "auto" : "none"}
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          bottom: 0,
          width: ACTION_WIDTH,
          backgroundColor: t.colors.errorFg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <TouchableOpacity
          onPress={commitDelete}
          style={{ flex: 1, justifyContent: "center", alignItems: "center", width: ACTION_WIDTH }}
        >
          <RNText style={{ color: "#fff", fontSize: 22 }}>🗑</RNText>
          <RNText style={{ color: "#fff", fontSize: 11, fontWeight: "600", marginTop: 2 }}>
            {rightLabel}
          </RNText>
        </TouchableOpacity>
      </View>
      {/* Content layer (slides) */}
      <Animated.View
        {...panResponder.panHandlers}
        style={{
          transform: [{ translateX }],
          backgroundColor: t.colors.surface,
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
};
