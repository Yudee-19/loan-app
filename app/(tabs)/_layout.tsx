/**
 * app/(tabs)/_layout.tsx
 *
 * Tab navigator — currently a single Dashboard tab. The Credit/Debit tabs
 * were removed when the app moved to the customer-first flow (loans are
 * accessed by drilling into a customer profile from the Dashboard search bar).
 *
 * The tab bar itself is hidden because there's only one tab; we keep the
 * Tabs navigator as the host so the existing route structure is preserved.
 */

import React from "react";
import { Pressable } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/lib/constants";

export default function TabsLayout() {
  const router = useRouter();

  const renderSettingsButton = () => (
    <Pressable className="mr-4" onPress={() => router.push("/settings")}>
      <Ionicons name="settings-outline" size={22} color={Colors.white} />
    </Pressable>
  );

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: Colors.navy },
        headerTintColor: Colors.white,
        headerTitleStyle: { fontWeight: "600" },
        tabBarStyle: { display: "none" },
        headerRight: renderSettingsButton,
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard" }} />
    </Tabs>
  );
}
