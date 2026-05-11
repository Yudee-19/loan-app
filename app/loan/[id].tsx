/**
 * app/loan/[id].tsx
 *
 * Loan detail screen — shows full loan information at the top, the three
 * action buttons (Redeem / Partial / Interest), the bullet-payment
 * schedule, and the running transaction history.
 *
 * Action buttons replace the legacy per-payment "Mark as Paid" flow.
 * Marking individual payments paid still works via the store but is no
 * longer surfaced — admins use Redeem to close the loan.
 */

import React, { useEffect, useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Pressable,
  Alert,
  Linking,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { format, parseISO } from "date-fns";

import PaymentRow from "@/components/PaymentRow";
import LoanActionBar from "@/components/LoanActionBar";
import PartialRedemptionDialog from "@/components/PartialRedemptionDialog";
import TransactionHistoryList from "@/components/TransactionHistoryList";

import { useLoanStore } from "@/stores/loanStore";
import { useCustomerStore } from "@/stores/customerStore";
import { formatCurrency, Colors } from "@/lib/constants";
import { calculateBulletPayment } from "@/lib/calculations";
import type { Customer, Loan } from "@/types";

export default function LoanDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const {
    currentLoan,
    payments,
    transactions,
    loading,
    actionLoading,
    fetchLoanDetail,
    deleteLoan,
    redeemLoan,
    partialRedemption,
    interestPaid,
    partialInterestPaid,
  } = useLoanStore();

  const fetchCustomerProfile = useCustomerStore((s) => s.fetchCustomerProfile);
  const customer = useCustomerStore((s) => s.currentCustomer);

  const [partialOpen, setPartialOpen] = useState(false);
  const [partialInterestOpen, setPartialInterestOpen] = useState(false);

  const loadData = useCallback(() => {
    if (id) fetchLoanDetail(id);
  }, [id, fetchLoanDetail]);

  useEffect(() => {
    loadData();
  }, [id]);

  // Once we have the loan, also load its customer for header / linking
  useEffect(() => {
    if (currentLoan?.customer_id) {
      fetchCustomerProfile(currentLoan.customer_id);
    }
  }, [currentLoan?.customer_id, fetchCustomerProfile]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleDelete = () => {
    if (!currentLoan) return;
    Alert.alert(
      "Delete Loan",
      `Delete this loan? Removes all payments and transaction history. Cannot be undone.`,
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
      ],
    );
  };

  const handleRedeem = async () => {
    if (!id) return;
    await redeemLoan(id);
  };

  const handlePartial = async (amount: number) => {
    if (!id) return;
    await partialRedemption(id, amount);
    setPartialOpen(false);
  };

  const handleInterest = async () => {
    if (!id) return;
    await interestPaid(id);
  };

  const handlePartialInterest = async (amount: number) => {
    if (!id) return;
    await partialInterestPaid(id, amount);
    setPartialInterestOpen(false);
  };

  const handleWhatsAppShare = async () => {
    if (!currentLoan || !customer) return;

    const message = buildShareMessage({
      loan: currentLoan,
      customer,
      totalAmount,
      totalInterest,
      interestPaidTotal,
    });
    const encoded = encodeURIComponent(message);
    const whatsappUrl = `whatsapp://send?text=${encoded}`;
    const webUrl = `https://wa.me/?text=${encoded}`;

    try {
      const canOpen = await Linking.canOpenURL(whatsappUrl);
      await Linking.openURL(canOpen ? whatsappUrl : webUrl);
    } catch {
      Alert.alert(
        "WhatsApp Not Available",
        "Could not open WhatsApp. Make sure it's installed on this device.",
      );
    }
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

  const { totalAmount, totalInterest } = calculateBulletPayment(
    currentLoan.principal_amount,
    currentLoan.rate_of_interest,
    currentLoan.tenure_months,
  );

  const progress = totalAmount > 0 ? currentLoan.total_paid / totalAmount : 0;

  // Interest paid = sum of interest + partial_interest transactions.
  // (redeem and principal-side partials don't count toward interest.)
  const interestPaidTotal = transactions
    .filter((t) => t.kind === "interest" || t.kind === "partial_interest")
    .reduce((s, t) => s + Number(t.amount), 0);

  const interestProgress =
    totalInterest > 0 ? interestPaidTotal / totalInterest : 0;

  const dueDate = parseISO(currentLoan.due_date);

  const accentColor =
    currentLoan.type === "credit" ? Colors.credit : Colors.debit;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <ScrollView
        className="flex-1 bg-surface"
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadData}
            tintColor={Colors.teal}
            colors={[Colors.teal]}
          />
        }
      >
        {/* ── Loan Info Card ──────────────────────────────────────────── */}
        <View className="bg-white rounded-xl p-5 mx-4 mt-4 mb-4 shadow-sm">
          {/* Customer name (tap → profile) + type badge */}
          <View className="flex-row justify-between items-center mb-2">
            <Pressable
              className="flex-row items-center flex-1"
              onPress={() =>
                router.push(`/customer/${currentLoan.customer_id}`)
              }
            >
              <Text className="text-xl font-bold text-navy" numberOfLines={1}>
                {customer?.name ?? "Customer"}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={Colors.muted}
              />
            </Pressable>
            <View
              className="px-2.5 py-1 rounded-full"
              style={{ backgroundColor: accentColor }}
            >
              <Text className="text-white text-xs font-medium capitalize">
                {currentLoan.type}
              </Text>
            </View>
          </View>

          {/* Phone */}
          {customer?.phone ? (
            <Pressable
              onPress={() => Linking.openURL(`tel:${customer.phone}`)}
              className="flex-row items-center mb-3"
            >
              <Ionicons name="call-outline" size={14} color={Colors.teal} />
              <Text className="text-sm text-teal ml-1">{customer.phone}</Text>
            </Pressable>
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
              <Text className="text-xs text-muted">Tenure</Text>
              <Text className="text-sm font-semibold text-navy">
                {currentLoan.tenure_months}{" "}
                {currentLoan.tenure_months === 1 ? "Month" : "Months"}
              </Text>
            </View>
            <View className="w-1/2">
              <Text className="text-xs text-muted">Start Date</Text>
              <Text className="text-sm font-semibold text-navy">
                {format(parseISO(currentLoan.start_date), "dd MMM yyyy")}
              </Text>
            </View>
            <View className="w-1/2">
              <Text className="text-xs text-muted">Due Date</Text>
              <Text className="text-sm font-semibold text-navy">
                {format(dueDate, "dd MMM yyyy")}
              </Text>
            </View>
          </View>

          {/* Progress bar — total loan amount */}
          <View className="mb-3">
            <View className="flex-row justify-between mb-1">
              <Text className="text-xs text-muted">
                Total Paid: {formatCurrency(currentLoan.total_paid)}
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

          {/* Progress bar — interest only */}
          <View className="mb-2">
            <View className="flex-row justify-between mb-1">
              <Text className="text-xs text-muted">
                Interest Paid: {formatCurrency(interestPaidTotal)}
              </Text>
              <Text className="text-xs text-muted">
                of {formatCurrency(totalInterest)}
              </Text>
            </View>
            <View className="h-2.5 bg-surface rounded-full overflow-hidden">
              <View
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(interestProgress * 100, 100)}%`,
                  backgroundColor: Colors.teal,
                }}
              />
            </View>
          </View>

          {/* Item type chip */}
          {currentLoan.item_type ? (
            <View className="mt-2 flex-row items-center">
              <Ionicons name="cube-outline" size={14} color={Colors.muted} />
              <Text className="text-xs text-muted ml-1">
                Mortgage item:{" "}
              </Text>
              <Text className="text-xs text-navy font-medium" numberOfLines={1}>
                {currentLoan.item_type}
              </Text>
            </View>
          ) : null}

          {currentLoan.notes ? (
            <View className="mt-3 pt-3 border-t border-gray-100">
              <Text className="text-xs text-muted mb-1">Notes</Text>
              <Text className="text-sm text-navy">{currentLoan.notes}</Text>
            </View>
          ) : null}
        </View>

        {/* ── Action Bar (Redeem / Partial / Interest / Partial Interest) ─ */}
        <LoanActionBar
          completed={currentLoan.is_completed}
          remainingAmount={currentLoan.remaining_amount}
          totalInterestAmount={totalInterest}
          busy={actionLoading}
          onRedeem={handleRedeem}
          onOpenPartial={() => setPartialOpen(true)}
          onInterest={handleInterest}
          onOpenPartialInterest={() => setPartialInterestOpen(true)}
        />

        {/* ── Transaction History ─────────────────────────────────────── */}
        <TransactionHistoryList transactions={transactions} />

        {/* ── Repayment Schedule (read-only) ──────────────────────────── */}
        <Text className="text-lg font-semibold text-navy mx-4 mt-2 mb-2">
          Repayment Schedule
        </Text>
        {payments.map((p) => (
          <PaymentRow
            key={p.id}
            payment={p}
            onMarkPaid={() => {}}
            onMarkUnpaid={() => {}}
            readOnly
          />
        ))}

        {/* ── Share via WhatsApp ──────────────────────────────────────── */}
        <Pressable
          className="rounded-xl py-3 flex-row justify-center items-center mx-4 mt-2"
          style={{ backgroundColor: "#25D366" }}
          onPress={handleWhatsAppShare}
        >
          <Ionicons name="logo-whatsapp" size={18} color="white" />
          <Text className="text-white font-medium ml-2">
            Share via WhatsApp
          </Text>
        </Pressable>

        {/* ── Edit / Delete (admin) ───────────────────────────────────── */}
        <View className="flex-row gap-3 mx-4 mt-2">
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
      </ScrollView>

      {/* ── Partial Redemption Modal ──────────────────────────────────── */}
      <PartialRedemptionDialog
        visible={partialOpen}
        maxAmount={currentLoan.remaining_amount}
        submitting={actionLoading}
        onCancel={() => setPartialOpen(false)}
        onConfirm={handlePartial}
      />

      {/* ── Partial Interest Modal ────────────────────────────────────── */}
      <PartialRedemptionDialog
        visible={partialInterestOpen}
        maxAmount={currentLoan.remaining_amount}
        title="Partial Interest Paid"
        amountLabel="Interest Amount Received (₹)"
        caption={`Total interest of this loan: ${formatCurrency(totalInterest)}`}
        submitting={actionLoading}
        onCancel={() => setPartialInterestOpen(false)}
        onConfirm={handlePartialInterest}
      />
    </>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function buildShareMessage(params: {
  loan: Loan;
  customer: Customer;
  totalAmount: number;
  totalInterest: number;
  interestPaidTotal: number;
}): string {
  const { loan, customer, totalAmount, totalInterest, interestPaidTotal } =
    params;

  const lines: string[] = [];

  lines.push("*Loan Details*");
  lines.push("");

  lines.push("*Customer Information*");
  lines.push(`Name: ${customer.name}`);
  if (customer.fathers_name)
    lines.push(`Father's Name: ${customer.fathers_name}`);
  if (customer.phone) lines.push(`Phone: ${customer.phone}`);
  if (customer.email) lines.push(`Email: ${customer.email}`);
  if (customer.address) lines.push(`Address: ${customer.address}`);
  if (customer.caste) lines.push(`Caste: ${customer.caste}`);
  lines.push("");

  lines.push("*Loan Information*");
  lines.push(`Type: ${loan.type === "credit" ? "Loan Taken" : "Loan Given"}`);
  lines.push(`Principal Amount: ${formatCurrency(loan.principal_amount)}`);
  lines.push(`Rate of Interest: ${loan.rate_of_interest}% per month`);
  lines.push(
    `Tenure: ${loan.tenure_months} ${
      loan.tenure_months === 1 ? "month" : "months"
    }`,
  );
  lines.push(`Start Date: ${format(parseISO(loan.start_date), "dd MMM yyyy")}`);
  lines.push(`Due Date: ${format(parseISO(loan.due_date), "dd MMM yyyy")}`);
  if (loan.item_type) lines.push(`Mortgage Item: ${loan.item_type}`);
  lines.push("");

  lines.push("*Repayment Status*");
  lines.push(`Total Interest: ${formatCurrency(totalInterest)}`);
  lines.push(`Total Repayable: ${formatCurrency(totalAmount)}`);
  lines.push(`Paid So Far: ${formatCurrency(loan.total_paid)}`);
  lines.push(`Interest Paid: ${formatCurrency(interestPaidTotal)}`);
  lines.push(`Remaining: ${formatCurrency(loan.remaining_amount)}`);
  lines.push(`Status: ${loan.is_completed ? "Completed" : "Active"}`);

  return lines.join("\n");
}
