/**
 * app/(tabs)/_layout.tsx
 *
 * Tab navigator layout — two tabs:
 * - Credit (loans the user TOOK — money going out, red accent)
 * - Debit  (loans the user GAVE — money coming in, green accent)
 *
 * A settings gear icon is placed in the header-right of both tabs.
 */

import React from "react";
import { Pressable } from "react-native";
import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/lib/constants";

export default function TabsLayout() {
  const router = useRouter();

  /** Shared header-right button that navigates to Settings. */
  const renderSettingsButton = () => (
    <Pressable className="mr-4" onPress={() => router.push("/settings")}>
      <Ionicons name="settings-outline" size={22} color={Colors.white} />
    </Pressable>
  );

  return (
    <Tabs
      screenOptions={{
        // ── Header Styling ──────────────────────────────────────────
        headerStyle: { backgroundColor: Colors.navy },
        headerTintColor: Colors.white,
        headerTitleStyle: { fontWeight: "600" },
        // ── Tab Bar Styling ─────────────────────────────────────────
        tabBarActiveTintColor: Colors.teal,
        tabBarInactiveTintColor: Colors.muted,
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopWidth: 0,
          elevation: 10,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
        headerRight: renderSettingsButton,
      }}
    >
      {/* ── Credit Tab ─────────────────────────────────────────────── */}
      <Tabs.Screen
        name="credit"
        options={{
          title: "Credit",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="arrow-down-circle" size={size} color={color} />
          ),
          // Use credit-red when this tab is active
          tabBarActiveTintColor: Colors.credit,
        }}
      />

      {/* ── Debit Tab ──────────────────────────────────────────────── */}
      <Tabs.Screen
        name="debit"
        options={{
          title: "Debit",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="arrow-up-circle" size={size} color={color} />
          ),
          // Use debit-green when this tab is active
          tabBarActiveTintColor: Colors.debit,
        }}
      />
    </Tabs>
  );
}
