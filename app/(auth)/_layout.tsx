/**
 * app/(auth)/_layout.tsx
 *
 * Layout for the authentication route group.
 * Contains login, register, and PIN lock screens.
 * No tab bar is shown — these are simple stacked screens.
 */

import React from "react";
import { Stack } from "expo-router";
import { Colors } from "@/lib/constants";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.navy },
        headerTintColor: Colors.white,
        headerTitleStyle: { fontWeight: "600" },
        contentStyle: { backgroundColor: Colors.surface },
      }}
    >
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen
        name="login"
        options={{ title: "Sign In", headerBackVisible: false }}
      />
      <Stack.Screen name="register" options={{ title: "Create Account" }} />
      <Stack.Screen
        name="pin"
        options={{
          title: "PIN Lock",
          headerBackVisible: false,
          gestureEnabled: false, // Prevent swiping back to bypass PIN
        }}
      />
    </Stack>
  );
}
