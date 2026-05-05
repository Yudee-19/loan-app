/**
 * app/(tabs)/credit.tsx
 *
 * Credit tab — loans the user has TAKEN (user owes money).
 *
 * UX:
 * - Default landing shows a centered search icon + subtitle.
 * - Tapping it opens an animated bottom sheet with a search bar
 *   and the full list of credit loans.
 * - Tapping a list row navigates to that loan's detail page.
 * - FAB stays available for adding a new credit loan.
 */

import React, { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import FAB from "@/components/FAB";
import LoanSearchSheet from "@/components/LoanSearchSheet";
import { useLoanStore } from "@/stores/loanStore";
import { Colors } from "@/lib/constants";

export default function CreditScreen() {
  const router = useRouter();
  const { creditLoans, fetchLoans } = useLoanStore();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Fetch on mount so the sheet has data ready when opened
  useEffect(() => {
    fetchLoans();
  }, []);

  return (
    <View className="flex-1 bg-surface items-center justify-center px-6">
      {/* ── Centered search trigger ──────────────────────────────────── */}
      <Pressable
        onPress={() => setSheetOpen(true)}
        className="items-center"
        hitSlop={20}
      >
        <View
          className="rounded-full p-8"
          style={{ backgroundColor: `${Colors.credit}1A` }}
        >
          <Ionicons name="search" size={56} color={Colors.credit} />
        </View>
        <Text className="text-navy font-semibold text-lg mt-5">
          Search credit loans
        </Text>
        <Text className="text-muted text-sm mt-1 text-center">
          Tap to find a loan you've taken
        </Text>
      </Pressable>

      {/* ── Search Sheet ─────────────────────────────────────────────── */}
      <LoanSearchSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        loans={creditLoans}
        type="credit"
      />

      {/* ── Floating Action Button ───────────────────────────────────── */}
      <FAB onPress={() => router.push("/loan/add?type=credit")} />
    </View>
  );
}
