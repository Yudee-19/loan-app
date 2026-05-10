/**
 * types/index.ts
 *
 * Central type definitions for LoanTracker.
 * All Supabase row shapes and insert helpers live here so every
 * file imports from one place.
 */

// ─── Customer ────────────────────────────────────────────────────────────────

/** A customer row as returned by Supabase. */
export interface Customer {
  id: string;
  user_id: string;
  name: string;
  /** 'credit' = loan-giver (admin borrows from them — admin owes) |
   * 'debit' = loan-taker (admin lends to them — admin is owed).
   * Pinned at creation; all loans against this customer inherit this type. */
  type: "credit" | "debit";
  fathers_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  caste: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

/** Shape used when inserting a new customer. */
export interface CustomerInsert {
  name: string;
  type: "credit" | "debit";
  fathers_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  caste?: string | null;
  remarks?: string | null;
}

// ─── Loan ────────────────────────────────────────────────────────────────────

/** A loan row as returned by Supabase (full columns). */
export interface Loan {
  id: string;
  user_id: string;
  customer_id: string;
  /** 'credit' = user TOOK a loan (owes money), 'debit' = user GAVE a loan (is owed) */
  type: "credit" | "debit";
  /** Original loan amount */
  principal_amount: number;
  /** Monthly rate of interest as a percentage (e.g. 10 means 10% per month) */
  rate_of_interest: number;
  /** Day of the month when each installment is due (1–28). Legacy; the
   * authoritative deadline is `due_date`. */
  payment_day_of_month: number;
  /** ISO date string — when the loan was disbursed */
  start_date: string;
  /** Admin-editable acceptance deadline. By default = start_date + tenure_months,
   * but the lender can override; does NOT affect interest calculation. */
  due_date: string;
  /** Total number of monthly installments (drives interest calc) */
  tenure_months: number;
  /** Cumulative amount paid so far */
  total_paid: number;
  /** Outstanding balance (principal + interest − total_paid) */
  remaining_amount: number;
  /** True once remaining_amount reaches 0 */
  is_completed: boolean;
  /** Free-text description of the mortgage item (gold, vehicle, etc.) */
  item_type: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Shape used when inserting a new loan. */
export interface LoanInsert {
  customer_id: string;
  type: "credit" | "debit";
  principal_amount: number;
  rate_of_interest: number;
  payment_day_of_month: number;
  start_date: string;
  due_date: string;
  tenure_months: number;
  remaining_amount: number;
  item_type?: string | null;
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

// ─── Loan Transaction ────────────────────────────────────────────────────────

/** Kinds of post-creation transactions on a loan.
 *  - `partial`         : principal-side partial payment (admin enters amount)
 *  - `interest`        : full interest of the loan paid in one shot (auto amount)
 *  - `partial_interest`: arbitrary interest-side payment (admin enters amount)
 *  - `redeem`          : full closure of the loan
 *  Both `partial` and the two interest kinds reduce remaining_amount via the
 *  insert trigger; `redeem` zeroes it out. */
export type LoanTransactionKind =
  | "partial"
  | "interest"
  | "partial_interest"
  | "redeem";

/** A loan_transactions row (Redeem / Partial / Interest events). */
export interface LoanTransaction {
  id: string;
  loan_id: string;
  user_id: string;
  kind: LoanTransactionKind;
  amount: number;
  /** First day of the month this interest payment covers. Only set for kind='interest'. */
  for_month: string | null;
  notes: string | null;
  created_at: string;
}

/** Shape used when inserting a new loan transaction. */
export interface LoanTransactionInsert {
  loan_id: string;
  user_id: string;
  kind: LoanTransactionKind;
  amount: number;
  for_month?: string | null;
  notes?: string | null;
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
