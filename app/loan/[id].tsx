/**
 * app/loan/[id].tsx
 *
 * Loan detail screen — shows full loan information at the top, followed
 * by the complete payment schedule as a scrollable list.
 *
 * Key behaviour:
 * - "Mark as Paid" button appears ONLY for payments whose due_date is
 *   today or in the past (overdue).  Future payments cannot be marked.
 * - Marking a payment triggers the DB trigger which updates
 *   loans.total_paid and loans.remaining_amount automatically.
 * - Pull-to-refresh reloads both loan and payments.
 */

import React, { useEffect, useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { parseISO } from "date-fns";

import PaymentRow from "@/components/PaymentRow";
import { useLoanStore } from "@/stores/loanStore";
import { formatCurrency, Colors } from "@/lib/constants";
import { calculateBulletPayment } from "@/lib/calculations";
import { format } from "date-fns";
import type { LoanStatus } from "@/types";

export default function LoanDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const {
    currentLoan,
    payments,
    loading,
    actionLoading,
    fetchLoanDetail,
    markPaymentPaid,
    markPaymentUnpaid,
    deleteLoan,
  } = useLoanStore();

  // Track which payment is currently being processed
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadData = useCallback(() => {
    if (id) fetchLoanDetail(id);
  }, [id]);

  useEffect(() => {
    loadData();
  }, [id]);

  // ── Payment Handlers ─────────────────────────────────────────────────────

  const handleMarkPaid = async (paymentId: string) => {
    setProcessingId(paymentId);
    await markPaymentPaid(paymentId);
    setProcessingId(null);
  };

  const handleMarkUnpaid = async (paymentId: string) => {
    setProcessingId(paymentId);
    await markPaymentUnpaid(paymentId);
    setProcessingId(null);
  };

  // ── Delete Handler ───────────────────────────────────────────────────────

  const handleDelete = () => {
    if (!currentLoan) return;
    Alert.alert(
      "Delete Loan",
      `Delete the loan for ${currentLoan.person_name}? This removes all payments and cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteLoan(currentLoan.id);
            router.back();
          },
        },
      ]
    );
  };

  // ── Loading State ────────────────────────────────────────────────────────

  if (loading && !currentLoan) {
    return (
      <View className="flex-1 justify-center items-center bg-surface">
        <ActivityIndicator size="large" color={Colors.teal} />
      </View>
    );
  }

  if (!currentLoan) return null;

  // ── Derived Values ───────────────────────────────────────────────────────

  const { totalAmount } = calculateBulletPayment(
    currentLoan.principal_amount,
    currentLoan.rate_of_interest,
    currentLoan.tenure_months,
  );

  const progress = totalAmount > 0 ? currentLoan.total_paid / totalAmount : 0;

  // Bullet payment due date — months after start_date on payment_day_of_month.
  // Falls back to the first unpaid payment row if available (handles legacy
  // multi-payment loans gracefully).
  const dueDate = (() => {
    const start = parseISO(currentLoan.start_date);
    return new Date(
      start.getFullYear(),
      start.getMonth() + currentLoan.tenure_months,
      currentLoan.payment_day_of_month,
    );
  })();

  // Determine overall loan status
  const loanStatus: LoanStatus = currentLoan.is_completed
    ? "completed"
    : "active";

  const accentColor =
    currentLoan.type === "credit" ? Colors.credit : Colors.debit;

  // ── Render ───────────────────────────────────────────────────────────────

  /** Header component rendered above the payments FlatList. */
  const renderHeader = () => (
    <View className="px-4 pt-4 pb-2">
      {/* ── Loan Info Card ─────────────────────────────────────────── */}
      <View className="bg-white rounded-xl p-5 mb-4 shadow-sm">
        {/* Person name + type badge */}
        <View className="flex-row justify-between items-center mb-3">
          <Text className="text-xl font-bold text-navy">
            {currentLoan.person_name}
          </Text>
          <View
            className="px-2.5 py-1 rounded-full"
            style={{ backgroundColor: accentColor }}
          >
            <Text className="text-white text-xs font-medium capitalize">
              {currentLoan.type}
            </Text>
          </View>
        </View>

        {/* Phone number */}
        {currentLoan.person_phone ? (
          <Text className="text-sm text-muted mb-3">
            {currentLoan.person_phone}
          </Text>
        ) : null}

        {/* Financial details grid */}
        <View className="flex-row flex-wrap gap-y-3 mb-4">
          <View className="w-1/2">
            <Text className="text-xs text-muted">Principal</Text>
            <Text className="text-sm font-semibold text-navy">
              {formatCurrency(currentLoan.principal_amount)}
            </Text>
          </View>
          <View className="w-1/2">
            <Text className="text-xs text-muted">Monthly Rate</Text>
            <Text className="text-sm font-semibold text-navy">
              {currentLoan.rate_of_interest}%
            </Text>
          </View>
          <View className="w-1/2">
            <Text className="text-xs text-muted">Total Repayable</Text>
            <Text className="text-sm font-semibold text-teal">
              {formatCurrency(totalAmount)}
            </Text>
          </View>
          <View className="w-1/2">
            <Text className="text-xs text-muted">Payment Month</Text>
            <Text className="text-sm font-semibold text-navy">
              {currentLoan.tenure_months}{" "}
              {currentLoan.tenure_months === 1 ? "Month" : "Months"}
            </Text>
          </View>
          <View className="w-1/2">
            <Text className="text-xs text-muted">Start Date</Text>
            <Text className="text-sm font-semibold text-navy">
              {parseISO(currentLoan.start_date).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </Text>
          </View>
          <View className="w-1/2">
            <Text className="text-xs text-muted">Due Date</Text>
            <Text className="text-sm font-semibold text-navy">
              {format(dueDate, "dd MMM yyyy")}
            </Text>
          </View>
        </View>

        {/* Progress bar */}
        <View className="mb-2">
          <View className="flex-row justify-between mb-1">
            <Text className="text-xs text-muted">
              Paid: {formatCurrency(currentLoan.total_paid)}
            </Text>
            <Text className="text-xs text-muted">
              Remaining: {formatCurrency(currentLoan.remaining_amount)}
            </Text>
          </View>
          <View className="h-2.5 bg-surface rounded-full overflow-hidden">
            <View
              className="h-full rounded-full"
              style={{
                width: `${Math.min(progress * 100, 100)}%`,
                backgroundColor: Colors.paid,
              }}
            />
          </View>
        </View>

        {/* Notes */}
        {currentLoan.notes ? (
          <View className="mt-3 pt-3 border-t border-gray-100">
            <Text className="text-xs text-muted mb-1">Notes</Text>
            <Text className="text-sm text-navy">{currentLoan.notes}</Text>
          </View>
        ) : null}
      </View>

      {/* ── Action Buttons ─────────────────────────────────────────── */}
      <View className="flex-row gap-3 mb-4">
        <Pressable
          className="flex-1 bg-teal rounded-xl py-3 flex-row justify-center items-center"
          onPress={() => router.push(`/loan/edit/${currentLoan.id}`)}
        >
          <Ionicons name="pencil" size={16} color="white" />
          <Text className="text-white font-medium ml-1.5">Edit</Text>
        </Pressable>
        <Pressable
          className="flex-1 bg-overdue rounded-xl py-3 flex-row justify-center items-center"
          onPress={handleDelete}
        >
          <Ionicons name="trash" size={16} color="white" />
          <Text className="text-white font-medium ml-1.5">Delete</Text>
        </Pressable>
      </View>

      {/* ── Section Title ──────────────────────────────────────────── */}
      <Text className="text-lg font-semibold text-navy mb-2">Repayment</Text>
    </View>
  );

  return (
    <FlatList
      className="flex-1 bg-surface"
      data={payments}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={renderHeader}
      contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={loadData}
          tintColor={Colors.teal}
          colors={[Colors.teal]}
        />
      }
      renderItem={({ item }) => (
        <PaymentRow
          payment={item}
          onMarkPaid={handleMarkPaid}
          onMarkUnpaid={handleMarkUnpaid}
          isProcessing={processingId === item.id}
        />
      )}
    />
  );
}
