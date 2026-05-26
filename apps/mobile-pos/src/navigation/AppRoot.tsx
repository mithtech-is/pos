import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { AppTabs } from "./AppTabs";
import MoreScreen from "../screens/MoreScreen";
import ReturnsScreen from "../screens/ReturnsScreen";
import BulkOrderScreen from "../screens/BulkOrderScreen";
import CashClosingScreen from "../screens/CashClosingScreen";
import SyncScreen from "../screens/SyncScreen";
import ConflictsScreen from "../screens/ConflictsScreen";
import TransactionsScreen from "../screens/TransactionsScreen";
import PendingOrdersScreen from "../screens/PendingOrdersScreen";

/**
 * Root navigator after auth. A simple native stack — the bottom tabs
 * (AppTabs) are the root; the less-frequent screens (Returns / Bulk / Cash /
 * Sync / Conflicts / Transactions / Pending) are stack routes you push by
 * navigating from the More screen.
 *
 * We deliberately avoid `@react-navigation/drawer` here because the v6
 * drawer is incompatible with Reanimated 4 (which Expo SDK 54 pins). The
 * "More" screen pattern is the more common UX in modern POS apps anyway.
 */
const Stack = createNativeStackNavigator();

export function AppRoot() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={AppTabs} />
      <Stack.Screen name="More" component={MoreScreen} />
      <Stack.Screen name="Transactions" component={TransactionsScreen} />
      <Stack.Screen name="Returns" component={ReturnsScreen} />
      <Stack.Screen name="Bulk" component={BulkOrderScreen} />
      <Stack.Screen name="Closing" component={CashClosingScreen} />
      <Stack.Screen name="Pending" component={PendingOrdersScreen} />
      <Stack.Screen name="Sync" component={SyncScreen} />
      <Stack.Screen name="Conflicts" component={ConflictsScreen} />
    </Stack.Navigator>
  );
}
