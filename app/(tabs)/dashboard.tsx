/**
 * app/(tabs)/dashboard.tsx
 *
 * Summary dashboard for the user's loans.
 *
 * UX:
 *  - Top of the screen has a Credit / Debit segmented selector.
 *  - Until the user picks one, an empty state nudges them to choose.
 *  - Once selected, the screen renders aggregate stats for that type:
 *      • Hero: total outstanding + active loan count
 *      • Stats grid: principal, interest, paid, total repayable
 *      • Health: active / completed / overdue counts
 *      • Overdue banner (if any)
 *      • Upcoming payments (next 30 days, top 5)
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { format, parseISO, startOfDay, isBefore, addDays } from "date-fns";

import { useLoanStore } from "@/stores/loanStore";
import { supabase } from "@/lib/supabase";
import { Colors, formatCurrency } from "@/lib/constants";
import { calculateBulletPayment } from "@/lib/calculations";

// ─── Types ───────────────────────────────────────────────────────────────────

type LoanType = "credit" | "debit";

interface UpcomingPayment {
  id: string;
  loan_id: string;
  due_date: string;
  amount: number;
  person_name: string;
  type: LoanType;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const router = useRouter();
  const { creditLoans, debitLoans, fetchLoans } = useLoanStore();

  const [selectedType, setSelectedType] = useState<LoanType | null>(null);
  const [upcoming, setUpcoming] = useState<UpcomingPayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch loans on mount (cheap if cache is warm)
  useEffect(() => {
    fetchLoans();
  }, []);

  /** Fetch all unpaid payments + their loan info for the upcoming list. */
  const fetchUnpaidPayments = async () => {
    setPaymentsLoading(true);
    const { data } = await supabase
      .from("payments")
      .select(
        "id, loan_id, due_date, amount, loan:loans!inner(person_name, type)",
      )
      .eq("is_paid", false)
      .order("due_date", { ascending: true });

    const items: UpcomingPayment[] = (data ?? []).map((p: any) => ({
      id: p.id,
      loan_id: p.loan_id,
      due_date: p.due_date,
      amount: Number(p.amount),
      person_name: p.loan?.person_name ?? "—",
      type: p.loan?.type as LoanType,
    }));

    setUpcoming(items);
    setPaymentsLoading(false);
  };

  // Refetch payments whenever the selected type changes (cheap, indexed query)
  useEffect(() => {
    if (selectedType) fetchUnpaidPayments();
  }, [selectedType]);

  /** Pull-to-refresh: reload both loans and unpaid payments. */
  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchLoans(), fetchUnpaidPayments()]);
    setRefreshing(false);
  };

  // ── Aggregate Stats ──────────────────────────────────────────────────────

  const summary = useMemo(() => {
    if (!selectedType) return null;
    const loans = selectedType === "credit" ? creditLoans : debitLoans;

    let totalPrincipal = 0;
    let totalInterest = 0;
    let totalRepayable = 0;
    let totalPaid = 0;
    let totalRemaining = 0;
    let active = 0;
    let completed = 0;

    for (const loan of loans) {
      const { totalAmount, totalInterest: interest } = calculateBulletPayment(
        loan.principal_amount,
        loan.rate_of_interest,
        loan.tenure_months,
      );
      totalPrincipal += loan.principal_amount;
      totalInterest += interest;
      totalRepayable += totalAmount;
      totalPaid += loan.total_paid;
      totalRemaining += loan.remaining_amount;
      if (loan.is_completed) completed++;
      else active++;
    }

    return {
      totalPrincipal,
      totalInterest,
      totalRepayable,
      totalPaid,
      totalRemaining,
      active,
      completed,
      total: loans.length,
    };
  }, [selectedType, creditLoans, debitLoans]);

  // ── Upcoming / Overdue Buckets ───────────────────────────────────────────

  const today = startOfDay(new Date());
  const next30 = addDays(today, 30);

  const filteredPayments = selectedType
    ? upcoming.filter((p) => p.type === selectedType)
    : [];

  const overduePayments = filteredPayments.filter((p) =>
    isBefore(parseISO(p.due_date), today),
  );

  const dueNext30 = filteredPayments.filter((p) => {
    const d = parseISO(p.due_date);
    return !isBefore(d, today) && isBefore(d, next30);
  });

  const overdueAmount = overduePayments.reduce((s, p) => s + p.amount, 0);

  const accent = selectedType === "credit" ? Colors.credit : Colors.debit;
  const isCredit = selectedType === "credit";

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <ScrollView
      className="flex-1 bg-surface"
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={Colors.teal}
          colors={[Colors.teal]}
        />
      }
    >
      {/* ── Type Selector ─────────────────────────────────────────────── */}
      <View
        className="bg-white rounded-xl p-1.5 mb-4 flex-row"
        style={{
          elevation: 1,
          shadowColor: "#000",
          shadowOpacity: 0.04,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 1 },
        }}
      >
        {(["credit", "debit"] as const).map((t) => {
          const sel = selectedType === t;
          const tColor = t === "credit" ? Colors.credit : Colors.debit;
          return (
            <Pressable
              key={t}
              className="flex-1 py-3 rounded-lg items-center"
              style={{ backgroundColor: sel ? tColor : "transparent" }}
              onPress={() => setSelectedType(t)}
            >
              <Text
                className={`font-semibold capitalize ${
                  sel ? "text-white" : "text-navy"
                }`}
              >
                {t}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Empty state when nothing is selected ─────────────────────── */}
      {!selectedType ? (
        <View className="items-center mt-20">
          <View className="bg-teal/10 rounded-full p-5">
            <Ionicons name="bar-chart-outline" size={56} color={Colors.teal} />
          </View>
          <Text className="text-navy font-semibold text-lg mt-5">
            Choose a category
          </Text>
          <Text className="text-muted text-sm mt-1 text-center px-8">
            Pick Credit or Debit above to see a summary of your loans.
          </Text>
        </View>
      ) : null}

      {/* ── Summary Content ──────────────────────────────────────────── */}
      {selectedType && summary ? (
        <>
          {/* Hero Card */}
          <View
            className="rounded-2xl p-5 mb-4"
            style={{ backgroundColor: accent }}
          >
            <Text className="text-white/80 text-sm">
              {isCredit ? "You owe" : "Owed to you"}
            </Text>
            <Text className="text-white font-bold text-3xl mt-1">
              {formatCurrency(summary.totalRemaining)}
            </Text>
            <Text className="text-white/80 text-xs mt-2">
              across {summary.active} active{" "}
              {summary.active === 1 ? "loan" : "loans"}
              {summary.completed > 0 ? ` · ${summary.completed} completed` : ""}
            </Text>
          </View>

          {/* Stats Grid */}
          <View className="flex-row flex-wrap -mx-1.5 mb-1">
            <StatCard
              label="Total Principal"
              value={summary.totalPrincipal}
              icon="cash-outline"
            />
            <StatCard
              label="Total Interest"
              value={summary.totalInterest}
              icon="trending-up-outline"
            />
            <StatCard
              label={isCredit ? "Paid Off" : "Received"}
              value={summary.totalPaid}
              icon="checkmark-done-outline"
            />
            <StatCard
              label="Total Repayable"
              value={summary.totalRepayable}
              icon="wallet-outline"
            />
          </View>

          {/* Health Counts */}
          <View className="bg-white rounded-xl p-4 mt-3 mb-4">
            <Text className="text-sm font-semibold text-navy mb-3">
              Loan Health
            </Text>
            <View className="flex-row justify-between">
              <CountChip
                label="Active"
                value={summary.active}
                color={Colors.teal}
              />
              <CountChip
                label="Completed"
                value={summary.completed}
                color={Colors.paid}
              />
              <CountChip
                label="Overdue"
                value={overduePayments.length}
                color={Colors.overdue}
              />
            </View>
          </View>

          {/* Overdue Alert */}
          {overduePayments.length > 0 ? (
            <View className="bg-red-50 border border-overdue rounded-xl p-4 mb-4 flex-row items-center">
              <Ionicons
                name="alert-circle"
                size={24}
                color={Colors.overdue}
              />
              <View className="flex-1 ml-3">
                <Text className="text-overdue font-semibold">
                  {overduePayments.length} overdue payment
                  {overduePayments.length === 1 ? "" : "s"}
                </Text>
                <Text className="text-overdue text-xs mt-0.5">
                  {formatCurrency(overdueAmount)} past due
                </Text>
              </View>
            </View>
          ) : null}

          {/* Upcoming Payments */}
          <View className="bg-white rounded-xl p-4 mb-4">
            <Text className="text-sm font-semibold text-navy mb-3">
              Upcoming (next 30 days)
            </Text>

            {paymentsLoading ? (
              <View className="py-4">
                <ActivityIndicator color={Colors.teal} />
              </View>
            ) : dueNext30.length === 0 ? (
              <View className="items-center py-6">
                <Ionicons
                  name="calendar-clear-outline"
                  size={32}
                  color={Colors.muted}
                />
                <Text className="text-muted text-sm mt-2">
                  No payments due in the next 30 days
                </Text>
              </View>
            ) : (
              dueNext30.slice(0, 5).map((p, idx) => (
                <Pressable
                  key={p.id}
                  className={`flex-row items-center justify-between py-3 ${
                    idx > 0 ? "border-t border-gray-100" : ""
                  }`}
                  onPress={() => router.push(`/loan/${p.loan_id}`)}
                >
                  <View className="flex-1 mr-3">
                    <Text
                      className="text-navy font-medium"
                      numberOfLines={1}
                    >
                      {p.person_name}
                    </Text>
                    <Text className="text-muted text-xs mt-0.5">
                      Due {format(parseISO(p.due_date), "dd MMM yyyy")}
                    </Text>
                  </View>
                  <Text className="font-semibold" style={{ color: accent }}>
                    {formatCurrency(p.amount)}
                  </Text>
                </Pressable>
              ))
            )}

            {dueNext30.length > 5 ? (
              <Text className="text-xs text-muted text-center mt-2">
                +{dueNext30.length - 5} more
              </Text>
            ) : null}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View className="w-1/2 px-1.5 mb-3">
      <View className="bg-white rounded-xl p-3.5">
        <Ionicons name={icon} size={18} color={Colors.teal} />
        <Text className="text-xs text-muted mt-1.5">{label}</Text>
        <Text className="text-base font-bold text-navy mt-0.5">
          {formatCurrency(value)}
        </Text>
      </View>
    </View>
  );
}

function CountChip({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <View className="items-center flex-1">
      <Text className="text-2xl font-bold" style={{ color }}>
        {value}
      </Text>
      <Text className="text-xs text-muted mt-0.5">{label}</Text>
    </View>
  );
}
