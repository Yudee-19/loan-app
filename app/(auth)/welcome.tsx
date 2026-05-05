/**
 * app/(auth)/welcome.tsx
 *
 * Landing screen shown to unauthenticated users when the app opens.
 * Provides entry points to Sign In and Create Account, plus a quick
 * tour of the app's core capabilities.
 */

import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Colors } from "@/lib/constants";

// ─── Feature List ────────────────────────────────────────────────────────────
// Surfaces the core value props on the landing screen.

const FEATURES: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}[] = [
  {
    icon: "swap-horizontal",
    title: "Credit & Debit, side by side",
    description:
      "Track loans you've taken and loans you've given in one place — no spreadsheets required.",
  },
  {
    icon: "notifications",
    title: "Never miss a due date",
    description:
      "Local reminders nudge you a day before each EMI so you (or your borrower) always pay on time.",
  },
  {
    icon: "calculator",
    title: "Auto interest & schedule",
    description:
      "Enter the principal, rate, and tenure — we generate the full month-by-month payment plan for you.",
  },
  {
    icon: "shield-checkmark",
    title: "PIN-locked & private",
    description:
      "Your data is encrypted in transit, stored securely, and gated behind an optional 4-digit PIN.",
  },
];

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingVertical: 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <View className="items-center mt-6">
        <View className="bg-teal/10 rounded-full p-5">
          <Ionicons name="wallet" size={64} color={Colors.teal} />
        </View>
        <Text className="text-4xl font-bold text-navy mt-5">LoanTracker</Text>
        <Text className="text-muted text-base mt-2 text-center px-2">
          The simple way to manage every rupee you've lent or borrowed.
        </Text>
      </View>

      {/* ── Tagline Card ────────────────────────────────────────────────── */}
      <View className="bg-navy rounded-2xl p-5 mt-8">
        <Text className="text-white text-lg font-semibold">
          Built for money lenders & borrowers.
        </Text>
        <Text className="text-white/80 text-sm mt-2 leading-5">
          Whether you're juggling a dozen monthly EMIs or keeping tabs on
          friends and family, LoanTracker keeps your numbers tidy and your
          reminders on time.
        </Text>
      </View>

      {/* ── Features ────────────────────────────────────────────────────── */}
      <View className="mt-8">
        <Text className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
          Why LoanTracker
        </Text>

        {FEATURES.map((f) => (
          <View
            key={f.title}
            className="flex-row items-start bg-white rounded-xl p-4 mb-3 border border-gray-100"
          >
            <View className="bg-teal/10 rounded-lg p-2 mr-3">
              <Ionicons name={f.icon} size={20} color={Colors.teal} />
            </View>
            <View className="flex-1">
              <Text className="text-navy font-semibold text-sm">
                {f.title}
              </Text>
              <Text className="text-muted text-xs mt-1 leading-4">
                {f.description}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      <View className="mt-6">
        <Pressable
          className="bg-teal rounded-xl py-4 items-center"
          onPress={() => router.push("/(auth)/login")}
        >
          <Text className="text-white font-semibold text-base">Sign In</Text>
        </Pressable>

        <Pressable
          className="border border-teal rounded-xl py-4 items-center mt-3"
          onPress={() => router.push("/(auth)/register")}
        >
          <Text className="text-teal font-semibold text-base">
            Create Account
          </Text>
        </Pressable>

        <Text className="text-muted text-xs text-center mt-4 px-4">
          By continuing, you agree to keep your loan records accurate and
          private. No payments are processed through this app.
        </Text>
      </View>
    </ScrollView>
  );
}
