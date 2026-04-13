/**
 * types/index.ts
 *
 * Central type definitions for LoanTracker.
 * All Supabase row shapes and insert helpers live here so every
 * file imports from one place.
 */

// ─── Loan ────────────────────────────────────────────────────────────────────

/** A loan row as returned by Supabase (full columns). */
export interface Loan {
  id: string;
  user_id: string;
  /** 'credit' = user TOOK a loan (owes money), 'debit' = user GAVE a loan (is owed) */
  type: "credit" | "debit";
  person_name: string;
  person_phone: string | null;
  /** Original loan amount */
  principal_amount: number;
  /** Annual rate of interest as a percentage (e.g. 12 means 12 %) */
  rate_of_interest: number;
  /** Day of the month when each installment is due (1–28) */
  payment_day_of_month: number;
  /** ISO date string — when the loan was disbursed */
  start_date: string;
  /** Total number of monthly installments */
  tenure_months: number;
  /** Cumulative amount paid so far */
  total_paid: number;
  /** Outstanding balance (principal + interest − total_paid) */
  remaining_amount: number;
  /** True once remaining_amount reaches 0 */
  is_completed: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Shape used when inserting a new loan (server defaults handle the rest). */
export interface LoanInsert {
  type: "credit" | "debit";
  person_name: string;
  person_phone?: string | null;
  principal_amount: number;
  rate_of_interest: number;
  payment_day_of_month: number;
  start_date: string;
  tenure_months: number;
  remaining_amount: number;
  notes?: string | null;
}

// ─── Payment ─────────────────────────────────────────────────────────────────

/** A payment (installment) row as returned by Supabase. */
export interface Payment {
  id: string;
  loan_id: string;
  user_id: string;
  installment_number: number;
  /** ISO date string for the due date */
  due_date: string;
  amount: number;
  is_paid: boolean;
  paid_at: string | null;
  /** expo-notifications ID — stored so we can cancel reminders when paid */
  notification_id: string | null;
  created_at: string;
}

/** Shape used when bulk-inserting the payment schedule for a new loan. */
export interface PaymentInsert {
  loan_id: string;
  user_id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  is_paid: boolean;
}

// ─── User Settings ───────────────────────────────────────────────────────────

/** Per-user settings stored in the `user_settings` table. */
export interface UserSettings {
  user_id: string;
  /** Bcrypt hash of the 4-digit PIN. null = PIN not set. */
  pin_hash: string | null;
  notification_enabled: boolean;
  /** How many days before a due date to fire the reminder notification */
  reminder_days_before: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Possible visual statuses for a loan card badge. */
export type LoanStatus = "active" | "completed" | "overdue";

/** Possible visual statuses for a payment row. */
export type PaymentStatus = "paid" | "upcoming" | "overdue";
