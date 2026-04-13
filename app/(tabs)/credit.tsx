/**
 * app/(tabs)/credit.tsx
 *
 * Credit tab — lists all loans the user has TAKEN (user owes money).
 *
 * Features:
 * - Pull-to-refresh.
 * - Empty state with CTA.
 * - FAB to add a new credit loan.
 * - Swipeable loan cards (edit / delete).
 */

import React, { useCallback, useEffect, useState } from "react";
import { View, FlatList, RefreshControl } from "react-native";
import { useRouter } from "expo-router";

import LoanCard from "@/components/LoanCard";
import EmptyState from "@/components/EmptyState";
import FAB from "@/components/FAB";
import { useLoanStore } from "@/stores/loanStore";
import { Colors } from "@/lib/constants";
import { supabase } from "@/lib/supabase";
import type { Payment } from "@/types";

export default function CreditScreen() {
  const router = useRouter();
  const { creditLoans, loading, fetchLoans, deleteLoan } = useLoanStore();

  // Map of loanId → earliest unpaid due_date (for the "Next due" label & overdue check)
  const [nextDueDates, setNextDueDates] = useState<Record<string, string>>({});

  /** Fetch loans + next due dates on mount and pull-to-refresh. */
  const loadData = useCallback(async () => {
    await fetchLoans();
    await fetchNextDueDates();
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  /** For each credit loan, find the next unpaid payment's due_date. */
  const fetchNextDueDates = async () => {
    const { data } = await supabase
      .from("payments")
      .select("loan_id, due_date")
      .eq("is_paid", false)
      .order("due_date", { ascending: true });

    if (data) {
      const map: Record<string, string> = {};
      // First occurrence per loan_id is the nearest unpaid due date
      for (const row of data as Pick<Payment, "loan_id" | "due_date">[]) {
        if (!map[row.loan_id]) {
          map[row.loan_id] = row.due_date;
        }
      }
      setNextDueDates(map);
    }
  };

  return (
    <View className="flex-1 bg-surface">
      <FlatList
        data={creditLoans}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadData}
            tintColor={Colors.credit}
            colors={[Colors.credit]}
          />
        }
        renderItem={({ item }) => (
          <LoanCard
            loan={item}
            onDelete={deleteLoan}
            nextDueDate={nextDueDates[item.id] ?? null}
          />
        )}
        // Show empty state when there are no credit loans
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              message="No credit loans yet"
              subMessage="Tap the + button to record a loan you've taken"
              icon="arrow-down-circle-outline"
              actionLabel="Add Credit Loan"
              onAction={() => router.push("/loan/add?type=credit")}
            />
          ) : null
        }
      />

      {/* Floating Action Button */}
      <FAB onPress={() => router.push("/loan/add?type=credit")} />
    </View>
  );
}
