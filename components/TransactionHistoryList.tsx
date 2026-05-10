/**
 * components/TransactionHistoryList.tsx
 *
 * Renders the chronological history of loan_transactions
 * (Redeem / Partial / Interest events) for a loan.
 */

import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { format, parseISO } from "date-fns";

import { Colors, formatCurrency } from "@/lib/constants";
import type { LoanTransaction, LoanTransactionKind } from "@/types";

const META: Record<
  LoanTransactionKind,
  { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  redeem: { label: "Redeemed", color: Colors.paid, icon: "checkmark-done" },
  partial: { label: "Partial Payment", color: Colors.teal, icon: "cash-outline" },
  interest: {
    label: "Interest Paid (Full)",
    color: Colors.navy,
    icon: "trending-up",
  },
  partial_interest: {
    label: "Partial Interest",
    color: Colors.muted,
    icon: "pulse",
  },
};

interface Props {
  transactions: LoanTransaction[];
}

export default function TransactionHistoryList({ transactions }: Props) {
  if (transactions.length === 0) {
    return (
      <View className="bg-white rounded-2xl p-5 mx-4 mb-4 items-center">
        <Ionicons name="time-outline" size={28} color={Colors.muted} />
        <Text className="text-muted text-sm mt-2">
          No transactions yet
        </Text>
      </View>
    );
  }

  return (
    <View className="bg-white rounded-2xl p-3 mx-4 mb-4">
      <Text className="text-xs font-semibold text-muted uppercase tracking-wider mb-2 px-1">
        Transaction History
      </Text>
      {transactions.map((tx, idx) => {
        const meta = META[tx.kind];
        return (
          <View
            key={tx.id}
            className={`flex-row items-center py-3 px-1 ${
              idx > 0 ? "border-t border-gray-100" : ""
            }`}
          >
            <View
              className="w-9 h-9 rounded-full items-center justify-center"
              style={{ backgroundColor: meta.color }}
            >
              <Ionicons name={meta.icon} size={18} color="white" />
            </View>
            <View className="flex-1 ml-3">
              <Text className="text-sm font-medium text-navy">
                {meta.label}
              </Text>
              <Text className="text-xs text-muted mt-0.5">
                {format(parseISO(tx.created_at), "dd MMM yyyy · hh:mm a")}
                {tx.kind === "interest" && tx.for_month
                  ? ` · for ${format(parseISO(tx.for_month), "MMM yyyy")}`
                  : ""}
              </Text>
              {tx.notes ? (
                <Text className="text-xs text-muted mt-1" numberOfLines={2}>
                  {tx.notes}
                </Text>
              ) : null}
            </View>
            <Text
              className="text-sm font-semibold"
              style={{ color: meta.color }}
            >
              {formatCurrency(Number(tx.amount))}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
