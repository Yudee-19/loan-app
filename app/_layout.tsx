/**
 * app/_layout.tsx
 *
 * Root layout — the entry point for the entire app.
 *
 * Responsibilities:
 * 1. Import global CSS (NativeWind / Tailwind).
 * 2. Prevent the splash screen from hiding until auth state is resolved.
 * 3. Wrap the app in GestureHandlerRootView (required for swipe gestures).
 * 4. Initialise the auth store and register notification permissions.
 * 5. Auth gate: redirect unauthenticated users to the login screen,
 *    and PIN-locked users to the PIN screen.
 */

import "@/global.css";

import React, { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";

import { useAuthStore } from "@/stores/authStore";
import { registerForNotifications } from "@/lib/notifications";
import { Colors } from "@/lib/constants";

// Keep splash visible while we check auth
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();

  const { user, loading, pinRequired, initialize } = useAuthStore();

  // ── Bootstrap: check session + register notifications ────────────────────
  useEffect(() => {
    initialize();
    registerForNotifications();
  }, []);

  // ── Hide splash once loading finishes ────────────────────────────────────
  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync();
    }
  }, [loading]);

  // ── Auth gate: redirect based on auth state ──────────────────────────────
  useEffect(() => {
    if (loading) return; // Wait until auth check completes

    const inAuthGroup = segments[0] === "(auth)";

    if (!user && !inAuthGroup) {
      // Not logged in → go to welcome landing
      router.replace("/(auth)/welcome");
    } else if (user && pinRequired) {
      // Logged in but PIN required → go to PIN screen
      router.replace("/(auth)/pin");
    } else if (user && !pinRequired && inAuthGroup) {
      // Logged in and PIN cleared → go to main tabs
      router.replace("/(tabs)/credit");
    }
  }, [user, loading, pinRequired, segments]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.navy },
          headerTintColor: Colors.white,
          headerTitleStyle: { fontWeight: "600" },
          contentStyle: { backgroundColor: Colors.surface },
        }}
      >
        {/* Index redirect — never visible, just a trampoline */}
        <Stack.Screen name="index" options={{ headerShown: false }} />
        {/* Auth screens — no header back button */}
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        {/* Main tab navigator */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* Loan detail & forms — presented as stack screens */}
        <Stack.Screen
          name="loan/add"
          options={{ title: "Add Loan", presentation: "modal" }}
        />
        <Stack.Screen
          name="loan/[id]"
          options={{ title: "Loan Details" }}
        />
        <Stack.Screen
          name="loan/edit/[id]"
          options={{ title: "Edit Loan", presentation: "modal" }}
        />
        {/* Settings */}
        <Stack.Screen name="settings" options={{ title: "Settings" }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
