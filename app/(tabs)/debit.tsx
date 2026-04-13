/**
 * app/(tabs)/debit.tsx
 *
 * Debit tab — lists all loans the user has GIVEN (user is owed money).
 *
 * Mirrors the credit tab structure with green accent colours.
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

export default function DebitScreen() {
  const router = useRouter();
  const { debitLoans, loading, fetchLoans, deleteLoan } = useLoanStore();

  // Map of loanId → earliest unpaid due_date
  const [nextDueDates, setNextDueDates] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    await fetchLoans();
    await fetchNextDueDates();
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  /** For each debit loan, find the next unpaid payment's due_date. */
  const fetchNextDueDates = async () => {
    const { data } = await supabase
      .from("payments")
      .select("loan_id, due_date")
      .eq("is_paid", false)
      .order("due_date", { ascending: true });

    if (data) {
      const map: Record<string, string> = {};
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
        data={debitLoans}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadData}
            tintColor={Colors.debit}
            colors={[Colors.debit]}
          />
        }
        renderItem={({ item }) => (
          <LoanCard
            loan={item}
            onDelete={deleteLoan}
            nextDueDate={nextDueDates[item.id] ?? null}
          />
        )}
        ListEmptyComponent={
          !loading ? (
            <EmptyState
              message="No debit loans yet"
              subMessage="Tap the + button to record a loan you've given"
              icon="arrow-up-circle-outline"
              actionLabel="Add Debit Loan"
              onAction={() => router.push("/loan/add?type=debit")}
            />
          ) : null
        }
      />

      {/* Floating Action Button */}
      <FAB onPress={() => router.push("/loan/add?type=debit")} />
    </View>
  );
}
