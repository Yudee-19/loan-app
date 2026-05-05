/**
 * stores/loanStore.ts
 *
 * Zustand store for loan and payment CRUD.
 *
 * Data flow:
 * 1. Screens call store actions (fetchLoans, addLoan, markPaid, etc.).
 * 2. Actions talk to Supabase and update local state on success.
 * 3. The `payments` table has a DB trigger (`trg_payment_update`) that
 *    automatically adjusts `loans.total_paid` and `loans.remaining_amount`
 *    when `is_paid` is toggled — so we refetch the parent loan after payment
 *    updates to keep the UI in sync.
 */

import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import {
  calculateBulletPayment,
  generateBulletPayment,
} from "@/lib/calculations";
import {
  schedulePaymentReminder,
  cancelNotification,
} from "@/lib/notifications";
import type { Loan, LoanInsert, Payment } from "@/types";
import { parseISO } from "date-fns";

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
  /** Global loading flag. */
  loading: boolean;
  /** Per-action loading (e.g. marking a payment). */
  actionLoading: boolean;

  // ── Actions ──────────────────────────────────────────────────────────────

  /** Fetch all loans for the current user, split by type. */
  fetchLoans: () => Promise<void>;
  /** Fetch a single loan by ID and its payment schedule. */
  fetchLoanDetail: (loanId: string) => Promise<void>;
  /** Add a new loan + auto-generate payment schedule + schedule notifications. */
  addLoan: (
    data: LoanInsert,
    userId: string,
    reminderDays: number
  ) => Promise<void>;
  /** Update an existing loan. Recalculates unpaid payments if key fields change. */
  updateLoan: (
    loanId: string,
    data: Partial<LoanInsert>,
    userId: string,
    reminderDays: number
  ) => Promise<void>;
  /** Delete a loan (cascade-deletes payments via FK). */
  deleteLoan: (loanId: string) => Promise<void>;
  /** Mark a single payment as paid. */
  markPaymentPaid: (paymentId: string) => Promise<void>;
  /** Unmark a payment (set back to unpaid). */
  markPaymentUnpaid: (paymentId: string) => Promise<void>;
  /** Cancel all existing notifications and reschedule with a new reminder window. */
  rescheduleAllNotifications: (reminderDays: number) => Promise<void>;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useLoanStore = create<LoanState>()((set, get) => ({
  creditLoans: [],
  debitLoans: [],
  currentLoan: null,
  payments: [],
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

      // Split into credit (user owes) and debit (user is owed)
      set({
        creditLoans: loans.filter((l) => l.type === "credit"),
        debitLoans: loans.filter((l) => l.type === "debit"),
      });
    } finally {
      set({ loading: false });
    }
  },

  // ── Fetch Single Loan + Payments ─────────────────────────────────────────

  fetchLoanDetail: async (loanId) => {
    set({ loading: true });
    try {
      // Fetch loan and its payments in parallel
      const [loanRes, paymentsRes] = await Promise.all([
        supabase.from("loans").select("*").eq("id", loanId).single(),
        supabase
          .from("payments")
          .select("*")
          .eq("loan_id", loanId)
          .order("due_date", { ascending: true }),
      ]);

      if (loanRes.error) throw loanRes.error;
      if (paymentsRes.error) throw paymentsRes.error;

      set({
        currentLoan: loanRes.data as Loan,
        payments: (paymentsRes.data as Payment[]) ?? [],
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
        .insert({
          ...data,
          user_id: userId,
        })
        .select()
        .single();

      if (loanError) throw loanError;
      const loan = loanData as Loan;

      // 2. Compute the bullet payment total and build a single-row schedule
      const { totalAmount } = calculateBulletPayment(
        data.principal_amount,
        data.rate_of_interest,
        data.tenure_months,
      );

      const schedule = generateBulletPayment(
        loan.id,
        userId,
        parseISO(data.start_date),
        data.payment_day_of_month,
        data.tenure_months,
        totalAmount,
      );

      // 3. Bulk-insert all payment rows
      const { data: paymentRows, error: payError } = await supabase
        .from("payments")
        .insert(schedule)
        .select();

      if (payError) throw payError;

      // 4. Schedule local notifications for each payment
      if (paymentRows) {
        for (const payment of paymentRows as Payment[]) {
          const notifId = await schedulePaymentReminder({
            paymentId: payment.id,
            loanType: data.type,
            personName: data.person_name,
            amount: payment.amount,
            dueDate: parseISO(payment.due_date),
            reminderDaysBefore: reminderDays,
          });

          // Store the notification ID on the payment row for later cancellation
          if (notifId) {
            await supabase
              .from("payments")
              .update({ notification_id: notifId })
              .eq("id", payment.id);
          }
        }
      }

      // 5. Refresh the loan list so the UI updates
      await get().fetchLoans();
    } finally {
      set({ actionLoading: false });
    }
  },

  // ── Update Loan ──────────────────────────────────────────────────────────

  updateLoan: async (loanId, data, userId, reminderDays) => {
    set({ actionLoading: true });
    try {
      // 1. Update the loan row itself
      const { error: updateError } = await supabase
        .from("loans")
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq("id", loanId);

      if (updateError) throw updateError;

      // 2. If key financial fields changed, regenerate unpaid payments
      if (
        data.principal_amount !== undefined ||
        data.rate_of_interest !== undefined ||
        data.tenure_months !== undefined ||
        data.start_date !== undefined ||
        data.payment_day_of_month !== undefined
      ) {
        // Fetch the updated loan for full values
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
              if (p.notification_id) {
                await cancelNotification(p.notification_id);
              }
            }
          }

          // Delete unpaid payments
          await supabase
            .from("payments")
            .delete()
            .eq("loan_id", loanId)
            .eq("is_paid", false);

          // If the bullet payment hasn't been paid yet, regenerate it.
          // (Once it's marked paid the loan is `is_completed`; we leave it.)
          const { count } = await supabase
            .from("payments")
            .select("*", { count: "exact", head: true })
            .eq("loan_id", loanId)
            .eq("is_paid", true);

          const paidCount = count ?? 0;

          if (paidCount === 0) {
            // Recompute the bullet payment and build a one-row schedule
            const { totalAmount } = calculateBulletPayment(
              loan.principal_amount,
              loan.rate_of_interest,
              loan.tenure_months,
            );

            const schedule = generateBulletPayment(
              loanId,
              userId,
              parseISO(loan.start_date),
              loan.payment_day_of_month,
              loan.tenure_months,
              totalAmount,
            );

            const { data: newPayments } = await supabase
              .from("payments")
              .insert(schedule)
              .select();

            // Schedule notification for the new payment
            if (newPayments) {
              for (const payment of newPayments as Payment[]) {
                const notifId = await schedulePaymentReminder({
                  paymentId: payment.id,
                  loanType: loan.type,
                  personName: loan.person_name,
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

            // Sync remaining_amount on the loan row
            await supabase
              .from("loans")
              .update({ remaining_amount: totalAmount - loan.total_paid })
              .eq("id", loanId);
          }
        }
      }

      // 3. Refresh data
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
      // 1. Cancel all scheduled notifications for this loan's payments
      const { data: payments } = await supabase
        .from("payments")
        .select("notification_id")
        .eq("loan_id", loanId);

      if (payments) {
        for (const p of payments) {
          if (p.notification_id) {
            await cancelNotification(p.notification_id);
          }
        }
      }

      // 2. Delete the loan (FK cascade removes payments automatically)
      const { error } = await supabase
        .from("loans")
        .delete()
        .eq("id", loanId);

      if (error) throw error;

      // 3. Refresh the loan list
      await get().fetchLoans();
    } finally {
      set({ actionLoading: false });
    }
  },

  // ── Mark Payment Paid ────────────────────────────────────────────────────

  markPaymentPaid: async (paymentId) => {
    set({ actionLoading: true });
    try {
      // 1. Update the payment row
      const { data, error } = await supabase
        .from("payments")
        .update({
          is_paid: true,
          paid_at: new Date().toISOString(),
        })
        .eq("id", paymentId)
        .select()
        .single();

      if (error) throw error;

      const payment = data as Payment;

      // 2. Cancel the notification for this payment
      if (payment.notification_id) {
        await cancelNotification(payment.notification_id);
      }

      // 3. Refresh loan detail to reflect updated totals
      //    (the DB trigger updates loans.total_paid & remaining_amount)
      if (payment.loan_id) {
        await get().fetchLoanDetail(payment.loan_id);
      }
    } finally {
      set({ actionLoading: false });
    }
  },

  // ── Mark Payment Unpaid ──────────────────────────────────────────────────

  markPaymentUnpaid: async (paymentId) => {
    set({ actionLoading: true });
    try {
      const { data, error } = await supabase
        .from("payments")
        .update({
          is_paid: false,
          paid_at: null,
        })
        .eq("id", paymentId)
        .select()
        .single();

      if (error) throw error;

      const payment = data as Payment;

      // Refresh loan detail to reflect reverted totals
      if (payment.loan_id) {
        await get().fetchLoanDetail(payment.loan_id);
      }
    } finally {
      set({ actionLoading: false });
    }
  },

  // ── Reschedule All Notifications ─────────────────────────────────────────
  // Called when the user changes the "remind X days before" setting.
  // Cancels every existing notification and reschedules with the new window.

  rescheduleAllNotifications: async (reminderDays) => {
    try {
      // 1. Fetch all unpaid payments that have a future due date,
      //    joined with their parent loan for notification text.
      const { data: unpaidPayments, error: payErr } = await supabase
        .from("payments")
        .select("id, loan_id, due_date, amount, notification_id")
        .eq("is_paid", false);

      if (payErr) throw payErr;
      if (!unpaidPayments || unpaidPayments.length === 0) return;

      // 2. Fetch all loans in one query so we can look up type + person_name
      const loanIds = [...new Set(unpaidPayments.map((p) => p.loan_id))];
      const { data: loans, error: loanErr } = await supabase
        .from("loans")
        .select("id, type, person_name")
        .in("id", loanIds);

      if (loanErr) throw loanErr;

      // Build a quick lookup: loanId → { type, person_name }
      const loanMap = new Map<string, { type: "credit" | "debit"; person_name: string }>();
      if (loans) {
        for (const loan of loans) {
          loanMap.set(loan.id, {
            type: loan.type as "credit" | "debit",
            person_name: loan.person_name,
          });
        }
      }

      // 3. Cancel old notifications, schedule new ones, update DB rows
      for (const payment of unpaidPayments) {
        // Cancel the existing notification if one was scheduled
        if (payment.notification_id) {
          await cancelNotification(payment.notification_id);
        }

        const loanInfo = loanMap.get(payment.loan_id);
        if (!loanInfo) continue;

        // Schedule a new notification with the updated reminder window
        const newNotifId = await schedulePaymentReminder({
          paymentId: payment.id,
          loanType: loanInfo.type,
          personName: loanInfo.person_name,
          amount: payment.amount,
          dueDate: parseISO(payment.due_date),
          reminderDaysBefore: reminderDays,
        });

        // Persist the new notification ID (or null if date was in the past)
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
