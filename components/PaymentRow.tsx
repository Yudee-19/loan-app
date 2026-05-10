/**
 * components/PaymentRow.tsx
 *
 * A single row in the payment schedule list on the loan detail screen.
 *
 * Business rules:
 * - "Mark as Paid" button is ONLY shown when the due date is today or in the past
 *   AND the payment is not yet paid.  Future payments cannot be marked paid.
 * - Haptic feedback fires on the "Mark as Paid" press.
 */

import React from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { parseISO, startOfDay, isBefore, isEqual, format } from "date-fns";

import { formatCurrency, Colors } from "@/lib/constants";
import type { Payment, PaymentStatus } from "@/types";

// ─── Props ───────────────────────────────────────────────────────────────────

interface PaymentRowProps {
  payment: Payment;
  /** Called when the user taps "Mark as Paid". */
  onMarkPaid: (paymentId: string) => void;
  /** Called when the user taps "Undo" on a paid payment. */
  onMarkUnpaid: (paymentId: string) => void;
  /** True while the parent is processing this specific payment. */
  isProcessing?: boolean;
  /** When true, suppress the action buttons (used on the loan detail screen,
   * where loan-level actions like Redeem replace per-row marking). */
  readOnly?: boolean;
}

// ─── Status Logic ────────────────────────────────────────────────────────────

/** Determine the display status of a payment. */
function getPaymentStatus(payment: Payment): PaymentStatus {
  if (payment.is_paid) return "paid";
  const today = startOfDay(new Date());
  const dueDate = startOfDay(parseISO(payment.due_date));
  if (isBefore(dueDate, today)) return "overdue";
  return "upcoming";
}

/** Visual config per status. */
const statusConfig: Record<
  PaymentStatus,
  { label: string; color: string; icon: string }
> = {
  paid: { label: "Paid", color: Colors.paid, icon: "checkmark-circle" },
  upcoming: { label: "Upcoming", color: Colors.teal, icon: "time-outline" },
  overdue: { label: "Overdue", color: Colors.overdue, icon: "alert-circle" },
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function PaymentRow({
  payment,
  onMarkPaid,
  onMarkUnpaid,
  isProcessing,
  readOnly,
}: PaymentRowProps) {
  const status = getPaymentStatus(payment);
  const config = statusConfig[status];

  // Show "Mark as Paid" only when due date is today or past AND not yet paid
  const today = startOfDay(new Date());
  const dueDate = startOfDay(parseISO(payment.due_date));
  const showMarkPaid =
    !readOnly &&
    !payment.is_paid &&
    (isEqual(dueDate, today) || isBefore(dueDate, today));

  /** Handle the mark-as-paid press with haptic feedback. */
  const handleMarkPaid = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onMarkPaid(payment.id);
  };

  return (
    <View className="bg-white rounded-xl p-4 mx-4 mb-2">
      <View className="flex-row justify-between items-center">
        {/* ── Left: Installment info ──────────────────────────────────── */}
        <View className="flex-1">
          <View className="flex-row items-center mb-1">
            <Ionicons
              name={config.icon as any}
              size={18}
              color={config.color}
            />
            <Text className="ml-1.5 text-sm font-medium" style={{ color: config.color }}>
              #{payment.installment_number} — {config.label}
            </Text>
          </View>

          <Text className="text-xs text-muted">
            Due: {format(parseISO(payment.due_date), "dd MMM yyyy")}
          </Text>

          {/* Show paid date if available */}
          {payment.is_paid && payment.paid_at ? (
            <Text className="text-xs text-paid mt-0.5">
              Paid on {format(parseISO(payment.paid_at), "dd MMM yyyy")}
            </Text>
          ) : null}
        </View>

        {/* ── Right: Amount + Action ──────────────────────────────────── */}
        <View className="items-end">
          <Text className="text-base font-semibold text-navy mb-1">
            {formatCurrency(payment.amount)}
          </Text>

          {/* Mark as Paid button — only for current/overdue unpaid payments */}
          {showMarkPaid ? (
            <Pressable
              className="bg-paid px-3 py-1.5 rounded-lg flex-row items-center"
              onPress={handleMarkPaid}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={14} color="white" />
                  <Text className="text-white text-xs font-medium ml-1">
                    Mark Paid
                  </Text>
                </>
              )}
            </Pressable>
          ) : null}

          {/* Undo button for paid payments */}
          {payment.is_paid && !readOnly ? (
            <Pressable
              className="px-3 py-1.5 rounded-lg flex-row items-center border border-muted"
              onPress={() => onMarkUnpaid(payment.id)}
              disabled={isProcessing}
            >
              <Ionicons name="arrow-undo" size={14} color={Colors.muted} />
              <Text className="text-muted text-xs ml-1">Undo</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
