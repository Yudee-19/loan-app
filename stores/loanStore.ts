/**
 * stores/loanStore.ts
 *
 * Zustand store for loan, payment-schedule, and loan-transaction CRUD.
 *
 * Data flow:
 * 1. Screens call store actions (fetch / add / redeem / partial / interest …).
 * 2. Actions talk to Supabase and update local state on success.
 * 3. Two DB triggers keep `loans.total_paid` and `loans.remaining_amount` in
 *    sync automatically:
 *      - `trg_payment_update`         — when a payment row's is_paid flips
 *      - `trg_loan_transaction_insert` — when a new loan_transaction row lands
 *    So we always refetch the parent loan after such writes.
 */

import { create } from "zustand";
import { parseISO } from "date-fns";

import { supabase } from "@/lib/supabase";
import { calculateBulletPayment } from "@/lib/calculations";
import {
  schedulePaymentReminder,
  cancelNotification,
} from "@/lib/notifications";
import type {
  Loan,
  LoanInsert,
  Payment,
  LoanTransaction,
} from "@/types";

// ─── State Shape ─────────────────────────────────────────────────────────────

interface LoanState {
  /** Loans the user TOOK (user owes money). */
  creditLoans: Loan[];
  /** Loans the user GAVE (user is owed money). */
  debitLoans: Loan[];
  /** Currently viewed loan detail. */
  currentLoan: Loan | null;
  /** Payments for the currently viewed loan. */
  payments: Payment[];
  /** Loan_transactions (Redeem / Partial / Interest events) for the current loan. */
  transactions: LoanTransaction[];
  /** Global loading flag. */
  loading: boolean;
  /** Per-action loading. */
  actionLoading: boolean;

  // ── Actions ──────────────────────────────────────────────────────────────

  fetchLoans: () => Promise<void>;
  fetchLoanDetail: (loanId: string) => Promise<void>;
  addLoan: (
    data: LoanInsert,
    userId: string,
    reminderDays: number,
  ) => Promise<string>;
  updateLoan: (
    loanId: string,
    data: Partial<LoanInsert>,
    userId: string,
    reminderDays: number,
  ) => Promise<void>;
  deleteLoan: (loanId: string) => Promise<void>;

  /** Fully redeem a loan: insert a 'redeem' transaction for the remaining balance. */
  redeemLoan: (loanId: string) => Promise<void>;
  /** Record a partial principal-side payment of `amount` against the loan. */
  partialRedemption: (loanId: string, amount: number) => Promise<void>;
  /** Record the FULL interest of the loan as paid in one shot
   *  (amount = principal × rate × tenure / 100). */
  interestPaid: (loanId: string) => Promise<void>;
  /** Record an arbitrary interest-side payment of `amount` against the loan. */
  partialInterestPaid: (loanId: string, amount: number) => Promise<void>;

  /** Cancel all existing notifications and reschedule with a new reminder window. */
  rescheduleAllNotifications: (reminderDays: number) => Promise<void>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Look up customer name for notification text. Returns "Customer" on failure. */
async function fetchCustomerName(customerId: string): Promise<string> {
  const { data, error } = await supabase
    .from("customers")
    .select("name")
    .eq("id", customerId)
    .single();

  if (error || !data) return "Customer";
  return (data as { name: string }).name;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useLoanStore = create<LoanState>()((set, get) => ({
  creditLoans: [],
  debitLoans: [],
  currentLoan: null,
  payments: [],
  transactions: [],
  loading: false,
  actionLoading: false,

  // ── Fetch All Loans ──────────────────────────────────────────────────────

  fetchLoans: async () => {
    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from("loans")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const loans = (data as Loan[]) ?? [];
      set({
        creditLoans: loans.filter((l) => l.type === "credit"),
        debitLoans: loans.filter((l) => l.type === "debit"),
      });
    } finally {
      set({ loading: false });
    }
  },

  // ── Fetch Single Loan + Payments + Transactions ──────────────────────────

  fetchLoanDetail: async (loanId) => {
    set({ loading: true });
    try {
      const [loanRes, paymentsRes, txRes] = await Promise.all([
        supabase.from("loans").select("*").eq("id", loanId).single(),
        supabase
          .from("payments")
          .select("*")
          .eq("loan_id", loanId)
          .order("due_date", { ascending: true }),
        supabase
          .from("loan_transactions")
          .select("*")
          .eq("loan_id", loanId)
          .order("created_at", { ascending: false }),
      ]);

      if (loanRes.error) throw loanRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      if (txRes.error) throw txRes.error;

      set({
        currentLoan: loanRes.data as Loan,
        payments: (paymentsRes.data as Payment[]) ?? [],
        transactions: (txRes.data as LoanTransaction[]) ?? [],
      });
    } finally {
      set({ loading: false });
    }
  },

  // ── Add Loan ─────────────────────────────────────────────────────────────

  addLoan: async (data, userId, reminderDays) => {
    set({ actionLoading: true });
    try {
      // 1. Insert the loan row
      const { data: loanData, error: loanError } = await supabase
        .from("loans")
        .insert({ ...data, user_id: userId })
        .select()
        .single();

      if (loanError) throw loanError;
      const loan = loanData as Loan;

      // 2. Compute bullet payment total and build a single-row schedule using
      //    the loan's admin-set due_date as the deadline.
      const { totalAmount } = calculateBulletPayment(
        data.principal_amount,
        data.rate_of_interest,
        data.tenure_months,
      );

      const schedule = [
        {
          loan_id: loan.id,
          user_id: userId,
          installment_number: 1,
          due_date: data.due_date,
          amount: totalAmount,
          is_paid: false,
        },
      ];

      // 3. Bulk-insert payment rows
      const { data: paymentRows, error: payError } = await supabase
        .from("payments")
        .insert(schedule)
        .select();

      if (payError) throw payError;

      // 4. Schedule reminder notifications (look up customer name first)
      if (paymentRows && paymentRows.length > 0) {
        const personName = await fetchCustomerName(data.customer_id);
        for (const payment of paymentRows as Payment[]) {
          const notifId = await schedulePaymentReminder({
            paymentId: payment.id,
            loanType: data.type,
            personName,
            amount: payment.amount,
            dueDate: parseISO(payment.due_date),
            reminderDaysBefore: reminderDays,
          });
          if (notifId) {
            await supabase
              .from("payments")
              .update({ notification_id: notifId })
              .eq("id", payment.id);
          }
        }
      }

      // 5. Refresh list
      await get().fetchLoans();
      return loan.id;
    } finally {
      set({ actionLoading: false });
    }
  },

  // ── Update Loan ──────────────────────────────────────────────────────────

  updateLoan: async (loanId, data, userId, reminderDays) => {
    set({ actionLoading: true });
    try {
      const { error: updateError } = await supabase
        .from("loans")
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq("id", loanId);

      if (updateError) throw updateError;

      // Regenerate unpaid payments if a financial field changed
      const scheduleAffected =
        data.principal_amount !== undefined ||
        data.rate_of_interest !== undefined ||
        data.tenure_months !== undefined ||
        data.start_date !== undefined ||
        data.payment_day_of_month !== undefined;

      if (scheduleAffected) {
        const { data: freshLoan } = await supabase
          .from("loans")
          .select("*")
          .eq("id", loanId)
          .single();

        if (freshLoan) {
          const loan = freshLoan as Loan;

          // Cancel notifications for unpaid payments before deleting them
          const { data: unpaid } = await supabase
            .from("payments")
            .select("notification_id")
            .eq("loan_id", loanId)
            .eq("is_paid", false);

          if (unpaid) {
            for (const p of unpaid) {
              if (p.notification_id) await cancelNotification(p.notification_id);
            }
          }

          await supabase
            .from("payments")
            .delete()
            .eq("loan_id", loanId)
            .eq("is_paid", false);

          // Only regenerate the bullet if nothing has been paid yet
          const { count } = await supabase
            .from("payments")
            .select("*", { count: "exact", head: true })
            .eq("loan_id", loanId)
            .eq("is_paid", true);

          const paidCount = count ?? 0;

          if (paidCount === 0) {
            const { totalAmount } = calculateBulletPayment(
              loan.principal_amount,
              loan.rate_of_interest,
              loan.tenure_months,
            );

            const schedule = [
              {
                loan_id: loanId,
                user_id: userId,
                installment_number: 1,
                due_date: loan.due_date,
                amount: totalAmount,
                is_paid: false,
              },
            ];

            const { data: newPayments } = await supabase
              .from("payments")
              .insert(schedule)
              .select();

            if (newPayments && newPayments.length > 0) {
              const personName = await fetchCustomerName(loan.customer_id);
              for (const payment of newPayments as Payment[]) {
                const notifId = await schedulePaymentReminder({
                  paymentId: payment.id,
                  loanType: loan.type,
                  personName,
                  amount: payment.amount,
                  dueDate: parseISO(payment.due_date),
                  reminderDaysBefore: reminderDays,
                });

                if (notifId) {
                  await supabase
                    .from("payments")
                    .update({ notification_id: notifId })
                    .eq("id", payment.id);
                }
              }
            }

            await supabase
              .from("loans")
              .update({ remaining_amount: totalAmount - loan.total_paid })
              .eq("id", loanId);
          }
        }
      }

      await get().fetchLoans();
      await get().fetchLoanDetail(loanId);
    } finally {
      set({ actionLoading: false });
    }
  },

  // ── Delete Loan ──────────────────────────────────────────────────────────

  deleteLoan: async (loanId) => {
    set({ actionLoading: true });
    try {
      const { data: payments } = await supabase
        .from("payments")
        .select("notification_id")
        .eq("loan_id", loanId);

      if (payments) {
        for (const p of payments) {
          if (p.notification_id) await cancelNotification(p.notification_id);
        }
      }

      const { error } = await supabase.from("loans").delete().eq("id", loanId);
      if (error) throw error;

      await get().fetchLoans();
    } finally {
      set({ actionLoading: false });
    }
  },

  // ── Redeem Loan ──────────────────────────────────────────────────────────

  redeemLoan: async (loanId) => {
    set({ actionLoading: true });
    try {
      // Read the current remaining balance to redeem.
      const { data: loanRow, error: loanErr } = await supabase
        .from("loans")
        .select("user_id, remaining_amount")
        .eq("id", loanId)
        .single();

      if (loanErr) throw loanErr;
      const remaining = Number((loanRow as any).remaining_amount);

      const { error } = await supabase.from("loan_transactions").insert({
        loan_id: loanId,
        user_id: (loanRow as any).user_id,
        kind: "redeem",
        amount: remaining,
      });

      if (error) throw error;

      // Cancel any pending payment reminders for this loan
      const { data: pending } = await supabase
        .from("payments")
        .select("notification_id")
        .eq("loan_id", loanId)
        .eq("is_paid", false);

      if (pending) {
        for (const p of pending) {
          if (p.notification_id) await cancelNotification(p.notification_id);
        }
      }

      await get().fetchLoanDetail(loanId);
      await get().fetchLoans();
    } finally {
      set({ actionLoading: false });
    }
  },

  // ── Partial Redemption ───────────────────────────────────────────────────

  partialRedemption: async (loanId, amount) => {
    set({ actionLoading: true });
    try {
      const { data: loanRow, error: loanErr } = await supabase
        .from("loans")
        .select("user_id")
        .eq("id", loanId)
        .single();

      if (loanErr) throw loanErr;

      const { error } = await supabase.from("loan_transactions").insert({
        loan_id: loanId,
        user_id: (loanRow as any).user_id,
        kind: "partial",
        amount,
      });

      if (error) throw error;

      await get().fetchLoanDetail(loanId);
      await get().fetchLoans();
    } finally {
      set({ actionLoading: false });
    }
  },

  // ── Interest Paid (FULL interest of the loan, single shot) ──────────────

  interestPaid: async (loanId) => {
    set({ actionLoading: true });
    try {
      const { data: loanRow, error: loanErr } = await supabase
        .from("loans")
        .select("user_id, principal_amount, rate_of_interest, tenure_months")
        .eq("id", loanId)
        .single();

      if (loanErr) throw loanErr;
      const row = loanRow as {
        user_id: string;
        principal_amount: number;
        rate_of_interest: number;
        tenure_months: number;
      };

      // Full interest of the loan = principal × rate × tenure / 100
      const { totalInterest } = calculateBulletPayment(
        row.principal_amount,
        row.rate_of_interest,
        row.tenure_months,
      );

      const { error } = await supabase.from("loan_transactions").insert({
        loan_id: loanId,
        user_id: row.user_id,
        kind: "interest",
        amount: totalInterest,
      });

      if (error) throw error;

      await get().fetchLoanDetail(loanId);
      await get().fetchLoans();
    } finally {
      set({ actionLoading: false });
    }
  },

  // ── Partial Interest Paid ───────────────────────────────────────────────

  partialInterestPaid: async (loanId, amount) => {
    set({ actionLoading: true });
    try {
      const { data: loanRow, error: loanErr } = await supabase
        .from("loans")
        .select("user_id")
        .eq("id", loanId)
        .single();

      if (loanErr) throw loanErr;

      const { error } = await supabase.from("loan_transactions").insert({
        loan_id: loanId,
        user_id: (loanRow as any).user_id,
        kind: "partial_interest",
        amount,
      });

      if (error) throw error;

      await get().fetchLoanDetail(loanId);
      await get().fetchLoans();
    } finally {
      set({ actionLoading: false });
    }
  },

  // ── Reschedule All Notifications ─────────────────────────────────────────

  rescheduleAllNotifications: async (reminderDays) => {
    try {
      // Pull unpaid payments + their parent loan's customer in one round-trip.
      const { data: unpaidPayments, error: payErr } = await supabase
        .from("payments")
        .select(
          "id, loan_id, due_date, amount, notification_id, " +
            "loan:loans!inner(type, customer_id, customer:customers!inner(name))",
        )
        .eq("is_paid", false);

      if (payErr) throw payErr;
      if (!unpaidPayments || unpaidPayments.length === 0) return;

      for (const payment of unpaidPayments as any[]) {
        if (payment.notification_id) {
          await cancelNotification(payment.notification_id);
        }

        const loanType = payment.loan?.type as "credit" | "debit" | undefined;
        const personName = payment.loan?.customer?.name ?? "Customer";
        if (!loanType) continue;

        const newNotifId = await schedulePaymentReminder({
          paymentId: payment.id,
          loanType,
          personName,
          amount: Number(payment.amount),
          dueDate: parseISO(payment.due_date),
          reminderDaysBefore: reminderDays,
        });

        await supabase
          .from("payments")
          .update({ notification_id: newNotifId })
          .eq("id", payment.id);
      }
    } catch (err) {
      console.error("Failed to reschedule notifications:", err);
    }
  },
}));
