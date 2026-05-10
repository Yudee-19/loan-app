/**
 * app/(tabs)/dashboard.tsx
 *
 * Landing screen after login. Shows a Credit / Debit summary and lets the
 * admin search for any customer via the persistent header search bar, or
 * create a new customer via the floating action button.
 *
 * Debit is the default selection (matches the new client-first lender flow).
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

import CustomerSearchBar from "@/components/CustomerSearchBar";
import FAB from "@/components/FAB";

import { useLoanStore } from "@/stores/loanStore";
import { useCustomerStore } from "@/stores/customerStore";
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
  customer_name: string;
  type: LoanType;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const router = useRouter();
  const { creditLoans, debitLoans, fetchLoans } = useLoanStore();
  const fetchCustomers = useCustomerStore((s) => s.fetchCustomers);
  const customers = useCustomerStore((s) => s.customers);

  const [selectedType, setSelectedType] = useState<LoanType>("debit");
  const [upcoming, setUpcoming] = useState<UpcomingPayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Bootstrap on mount
  useEffect(() => {
    fetchLoans();
    fetchCustomers();
  }, []);

  /** Fetch all unpaid payments + their loan + customer name. */
  const fetchUnpaidPayments = async () => {
    setPaymentsLoading(true);
    const { data } = await supabase
      .from("payments")
      .select(
        "id, loan_id, due_date, amount, " +
          "loan:loans!inner(type, customer:customers!inner(name))",
      )
      .eq("is_paid", false)
      .order("due_date", { ascending: true });

    const items: UpcomingPayment[] = (data ?? []).map((p: any) => ({
      id: p.id,
      loan_id: p.loan_id,
      due_date: p.due_date,
      amount: Number(p.amount),
      customer_name: p.loan?.customer?.name ?? "—",
      type: p.loan?.type as LoanType,
    }));

    setUpcoming(items);
    setPaymentsLoading(false);
  };

  // Refetch payments whenever the selected type changes
  useEffect(() => {
    fetchUnpaidPayments();
  }, [selectedType]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchLoans(), fetchUnpaidPayments(), fetchCustomers()]);
    setRefreshing(false);
  };

  // ── Aggregate Stats ──────────────────────────────────────────────────────

  const summary = useMemo(() => {
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

  const filteredPayments = upcoming.filter((p) => p.type === selectedType);

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

  // Loan list for the selected type
  const allLoans = isCredit ? creditLoans : debitLoans;

  // Customer name lookup keyed by customer_id
  const customerById = useMemo(() => {
    const map = new Map<string, (typeof customers)[number]>();
    for (const c of customers) map.set(c.id, c);
    return map;
  }, [customers]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View className="flex-1 bg-surface">
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.teal}
            colors={[Colors.teal]}
          />
        }
      >
        {/* ── Persistent Customer Search ────────────────────────────────── */}
        <View className="mb-4">
          <CustomerSearchBar />
        </View>

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
          {(["debit", "credit"] as const).map((t) => {
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

        {/* ── Hero Card ─────────────────────────────────────────────────── */}
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

        {/* ── Stats Grid ────────────────────────────────────────────────── */}
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

        {/* ── Health Counts ─────────────────────────────────────────────── */}
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

        {/* ── Overdue Alert ─────────────────────────────────────────────── */}
        {overduePayments.length > 0 ? (
          <View className="bg-red-50 border border-overdue rounded-xl p-4 mb-4 flex-row items-center">
            <Ionicons name="alert-circle" size={24} color={Colors.overdue} />
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

        {/* ── Upcoming Payments ─────────────────────────────────────────── */}
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
                    {p.customer_name}
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

        {/* ── All Loans ─────────────────────────────────────────────────── */}
        <View className="bg-white rounded-xl p-4">
          <Text className="text-sm font-semibold text-navy mb-3">
            All {isCredit ? "Credit" : "Debit"} Loans
          </Text>

          {allLoans.length === 0 ? (
            <View className="items-center py-6">
              <Ionicons
                name="document-outline"
                size={28}
                color={Colors.muted}
              />
              <Text className="text-muted text-sm mt-2">
                No {isCredit ? "credit" : "debit"} loans yet
              </Text>
            </View>
          ) : (
            allLoans.map((loan, idx) => {
              const name =
                customerById.get(loan.customer_id)?.name ?? "Customer";
              return (
                <Pressable
                  key={loan.id}
                  className={`py-3 ${
                    idx > 0 ? "border-t border-gray-100" : ""
                  }`}
                  onPress={() => router.push(`/loan/${loan.id}`)}
                >
                  <View className="flex-row justify-between items-center mb-1">
                    <Text
                      className="text-navy font-medium flex-1 mr-2"
                      numberOfLines={1}
                    >
                      {name}
                    </Text>
                    <Text className="text-sm font-semibold text-navy">
                      {formatCurrency(loan.principal_amount)}
                    </Text>
                  </View>
                  <View className="flex-row justify-between items-center">
                    <Text className="text-xs text-muted">
                      {format(parseISO(loan.start_date), "dd MMM yy")} →{" "}
                      {format(parseISO(loan.due_date), "dd MMM yy")}
                    </Text>
                    <Text className="text-xs text-muted">
                      {loan.rate_of_interest}% / mo
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* ── FAB: New Customer ─────────────────────────────────────────── */}
      <FAB onPress={() => router.push("/customer/add")} label="Customer" />
    </View>
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
