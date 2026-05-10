/**
 * components/LoanCard.tsx
 *
 * Card component rendered in the Credit / Debit FlatLists.
 *
 * Features:
 * - Displays person name, principal, EMI, rate, next due date, remaining balance.
 * - Progress bar showing repayment percentage.
 * - Status badge: Active / Completed / Overdue.
 * - Swipe-left to delete (with confirmation alert).
 * - Swipe-right to edit.
 * - Tap phone number to call.
 */

import React, { useRef } from "react";
import {
  View,
  Text,
  Pressable,
  Alert,
  Linking,
  Animated as RNAnimated,
} from "react-native";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { parseISO, isBefore, startOfDay } from "date-fns";

import { formatCurrency, Colors } from "@/lib/constants";
import { calculateBulletPayment } from "@/lib/calculations";
import type { Loan, LoanStatus } from "@/types";

// ─── Props ───────────────────────────────────────────────────────────────────

interface LoanCardProps {
  loan: Loan;
  /** The owning customer's name — shown as the card heading. */
  customerName: string;
  /** Optional phone number for the tap-to-call icon. */
  customerPhone?: string | null;
  /** Called when the user confirms deletion via the swipe action. */
  onDelete: (loanId: string) => void;
  /** Optional: next unpaid payment due date (ISO string) for overdue check. */
  nextDueDate?: string | null;
}

// ─── Status Logic ────────────────────────────────────────────────────────────

/** Determine the visual status of a loan. */
function getLoanStatus(loan: Loan, nextDueDate?: string | null): LoanStatus {
  if (loan.is_completed) return "completed";
  if (nextDueDate) {
    const today = startOfDay(new Date());
    const due = startOfDay(parseISO(nextDueDate));
    if (isBefore(due, today)) return "overdue";
  }
  return "active";
}

/** Map loan status to background colour for the badge. */
const statusColors: Record<LoanStatus, string> = {
  active: Colors.teal,
  completed: Colors.paid,
  overdue: Colors.overdue,
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function LoanCard({
  loan,
  customerName,
  customerPhone,
  onDelete,
  nextDueDate,
}: LoanCardProps) {
  const router = useRouter();
  const swipeableRef = useRef<Swipeable>(null);

  const status = getLoanStatus(loan, nextDueDate);

  // Bullet payment total (principal + flat monthly interest × months)
  const { totalAmount } = calculateBulletPayment(
    loan.principal_amount,
    loan.rate_of_interest,
    loan.tenure_months,
  );
  const progress = totalAmount > 0 ? loan.total_paid / totalAmount : 0;

  // ── Swipe Actions ────────────────────────────────────────────────────────

  /** Left swipe → Edit action (green) */
  const renderLeftActions = (
    _progress: RNAnimated.AnimatedInterpolation<number>,
    _dragX: RNAnimated.AnimatedInterpolation<number>
  ) => (
    <Pressable
      className="bg-teal justify-center items-center px-6 rounded-l-xl"
      onPress={() => {
        swipeableRef.current?.close();
        router.push(`/loan/edit/${loan.id}`);
      }}
    >
      <Ionicons name="pencil" size={24} color="white" />
      <Text className="text-white text-xs mt-1">Edit</Text>
    </Pressable>
  );

  /** Right swipe → Delete action (red) */
  const renderRightActions = (
    _progress: RNAnimated.AnimatedInterpolation<number>,
    _dragX: RNAnimated.AnimatedInterpolation<number>
  ) => (
    <Pressable
      className="bg-overdue justify-center items-center px-6 rounded-r-xl"
      onPress={() => {
        swipeableRef.current?.close();
        // Confirm before deleting
        Alert.alert(
          "Delete Loan",
          `Are you sure you want to delete the loan for ${customerName}? This cannot be undone.`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: () => onDelete(loan.id),
            },
          ]
        );
      }}
    >
      <Ionicons name="trash" size={24} color="white" />
      <Text className="text-white text-xs mt-1">Delete</Text>
    </Pressable>
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      overshootLeft={false}
      overshootRight={false}
    >
      <Pressable
        className="bg-white rounded-xl p-4 mx-4 mb-3 shadow-sm"
        onPress={() => router.push(`/loan/${loan.id}`)}
      >
        {/* ── Header: Name + Status Badge ─────────────────────────────── */}
        <View className="flex-row justify-between items-center mb-2">
          <View className="flex-row items-center flex-1">
            <Text className="text-lg font-semibold text-navy" numberOfLines={1}>
              {customerName}
            </Text>
            {customerPhone ? (
              <Pressable
                className="ml-2"
                onPress={() => Linking.openURL(`tel:${customerPhone}`)}
              >
                <Ionicons name="call-outline" size={16} color={Colors.teal} />
              </Pressable>
            ) : null}
          </View>

          {/* Status badge */}
          <View
            className="px-2 py-0.5 rounded-full"
            style={{ backgroundColor: statusColors[status] }}
          >
            <Text className="text-white text-xs font-medium capitalize">
              {status}
            </Text>
          </View>
        </View>

        {/* ── Financial Details ────────────────────────────────────────── */}
        <View className="flex-row justify-between mb-2">
          <View>
            <Text className="text-xs text-muted">Principal</Text>
            <Text className="text-sm font-medium text-navy">
              {formatCurrency(loan.principal_amount)}
            </Text>
          </View>
          <View>
            <Text className="text-xs text-muted">Rate</Text>
            <Text className="text-sm font-medium text-navy">
              {loan.rate_of_interest}% / mo
            </Text>
          </View>
          <View>
            <Text className="text-xs text-muted">Total Due</Text>
            <Text className="text-sm font-medium text-navy">
              {formatCurrency(totalAmount)}
            </Text>
          </View>
        </View>

        {/* ── Progress Bar ─────────────────────────────────────────────── */}
        <View className="mb-2">
          <View className="flex-row justify-between mb-1">
            <Text className="text-xs text-muted">Remaining</Text>
            <Text className="text-xs text-muted">
              {formatCurrency(loan.remaining_amount)}
            </Text>
          </View>
          <View className="h-2 bg-surface rounded-full overflow-hidden">
            <View
              className="h-full rounded-full"
              style={{
                width: `${Math.min(progress * 100, 100)}%`,
                backgroundColor:
                  status === "overdue" ? Colors.overdue : Colors.paid,
              }}
            />
          </View>
        </View>

        {/* ── Footer: Next Due Date ────────────────────────────────────── */}
        {nextDueDate && !loan.is_completed ? (
          <Text className="text-xs text-muted">
            Next due:{" "}
            {parseISO(nextDueDate).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </Text>
        ) : null}
      </Pressable>
    </Swipeable>
  );
}
