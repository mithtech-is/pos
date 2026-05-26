import React from "react";
import { Text, View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import CartScreen from "../screens/CartScreen";
import OrdersScreen from "../screens/OrdersScreen";
import SettingsScreen from "../screens/SettingsScreen";
import ProductsScreen from "../screens/ProductsScreen";
import ScanScreen from "../screens/ScanScreen";
import { useTheme } from "../design";
import { useCartStore } from "../state/cart";

/**
 * 5-tab bottom navigation: Products → Orders → Scan → Cart → Settings.
 *
 * Each tab is itself a Native Stack so deep navigation (e.g. an order detail
 * pushed from the Orders tab) keeps the tab bar visible.
 *
 * The Scan tab hides the tab bar while active (so the full-screen camera UI
 * isn't cropped); we toggle that via `tabBarStyle` on focus.
 *
 * Cart tab shows a badge with the current cart line count.
 */

const Tabs = createBottomTabNavigator();
const ProductsStack = createNativeStackNavigator();
const OrdersStack = createNativeStackNavigator();
const CartStack = createNativeStackNavigator();
const SettingsStack = createNativeStackNavigator();

function ProductsNav() {
  return (
    <ProductsStack.Navigator screenOptions={{ headerShown: false }}>
      <ProductsStack.Screen name="ProductsHome" component={ProductsScreen} />
    </ProductsStack.Navigator>
  );
}

function OrdersNav() {
  return (
    <OrdersStack.Navigator screenOptions={{ headerShown: false }}>
      <OrdersStack.Screen name="OrdersHome" component={OrdersScreen} />
    </OrdersStack.Navigator>
  );
}

function CartNav() {
  return (
    <CartStack.Navigator screenOptions={{ headerShown: false }}>
      <CartStack.Screen name="CartHome" component={CartScreen} />
    </CartStack.Navigator>
  );
}

function SettingsNav() {
  return (
    <SettingsStack.Navigator screenOptions={{ headerShown: false }}>
      <SettingsStack.Screen name="SettingsHome" component={SettingsScreen} />
    </SettingsStack.Navigator>
  );
}

/** Renders an emoji as the tab icon — keeps the design free of icon-set deps. */
function TabIcon({ char, focused, color }: { char: string; focused: boolean; color: string }) {
  return (
    <Text
      style={{
        fontSize: focused ? 24 : 22,
        opacity: focused ? 1 : 0.6,
        color,
      }}
    >
      {char}
    </Text>
  );
}

export function AppTabs() {
  const t = useTheme();
  const cartCount = useCartStore((s) => s.lines.length);

  return (
    <Tabs.Navigator
      screenOptions={({ route }: { route: { name: string } }) => ({
        headerShown: false,
        tabBarActiveTintColor: t.colors.primary,
        tabBarInactiveTintColor: t.colors.muted2,
        tabBarStyle: {
          backgroundColor: t.colors.surface,
          borderTopColor: t.colors.border,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
          // Hide the tab bar entirely while the Scan tab is active.
          display: route.name === "Scan" ? "none" : "flex",
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "500",
          marginTop: 2,
        },
      })}
    >
      <Tabs.Screen
        name="Products"
        component={ProductsNav}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabIcon char="🛍" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="Orders"
        component={OrdersNav}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabIcon char="📒" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="Scan"
        component={ScanScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <View
              style={{
                backgroundColor: focused ? t.colors.primary : t.colors.primarySoft,
                width: 52,
                height: 52,
                borderRadius: 26,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 4,
              }}
            >
              <Text style={{ fontSize: 22, color: focused ? t.colors.primaryFg : t.colors.primary }}>
                ⌖
              </Text>
            </View>
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="Cart"
        component={CartNav}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabIcon char="🛒" focused={focused} color={color} />
          ),
          tabBarBadge: cartCount > 0 ? cartCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: t.colors.primary,
            color: t.colors.primaryFg,
            fontSize: 11,
            minWidth: 18,
            height: 18,
            lineHeight: 17,
          },
        }}
      />
      <Tabs.Screen
        name="Settings"
        component={SettingsNav}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabIcon char="⚙" focused={focused} color={color} />
          ),
        }}
      />
    </Tabs.Navigator>
  );
}
