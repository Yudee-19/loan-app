/**
 * app/(tabs)/debit.tsx
 *
 * Debit tab — loans the user has GIVEN (user is owed money).
 *
 * Mirrors the Credit tab: a centered search icon opens a slide-up
 * sheet with the searchable loan list. Tapping a row opens detail.
 */

import React, { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import FAB from "@/components/FAB";
import LoanSearchSheet from "@/components/LoanSearchSheet";
import { useLoanStore } from "@/stores/loanStore";
import { Colors } from "@/lib/constants";

export default function DebitScreen() {
  const router = useRouter();
  const { debitLoans, fetchLoans } = useLoanStore();
  const [sheetOpen, setSheetOpen] = useState(false);

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
          style={{ backgroundColor: `${Colors.debit}1A` }}
        >
          <Ionicons name="search" size={56} color={Colors.debit} />
        </View>
        <Text className="text-navy font-semibold text-lg mt-5">
          Search debit loans
        </Text>
        <Text className="text-muted text-sm mt-1 text-center">
          Tap to find a loan you've given
        </Text>
      </Pressable>

      {/* ── Search Sheet ─────────────────────────────────────────────── */}
      <LoanSearchSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        loans={debitLoans}
        type="debit"
      />

      {/* ── Floating Action Button ───────────────────────────────────── */}
      <FAB onPress={() => router.push("/loan/add?type=debit")} />
    </View>
  );
}
