/**
 * lib/calculations.ts
 *
 * Math helpers for the bullet-payment loan model.
 *
 * Loans repay in a single shot at the end of a fixed window (1, 2, or 3
 * months). Interest is a flat **per-month** percentage of the principal:
 *
 *   Total Interest = principal × monthlyRate × months / 100
 *   Total Amount   = principal + Total Interest
 *
 * Worked example:
 *   principal = 500000, monthlyRate = 10, months = 2
 *   → interest = 500000 × 10 × 2 / 100 = 100000
 *   → total    = 500000 + 100000       = 600000
 */

import { format } from "date-fns";
import type { PaymentInsert } from "@/types";

// ─── Interest Calculation ────────────────────────────────────────────────────

export interface BulletPaymentResult {
  /** Total interest accrued over the full window. */
  totalInterest: number;
  /** Principal + total interest — what the borrower repays in one shot. */
  totalAmount: number;
}

/**
 * Calculate the single-shot bullet payment due at the end of the window.
 *
 * @param principal    - Original loan amount.
 * @param monthlyRate  - Flat monthly rate as a percentage (e.g. 10 for 10 %).
 * @param months       - Number of months until repayment (expected 1 | 2 | 3).
 */
export function calculateBulletPayment(
  principal: number,
  monthlyRate: number,
  months: number,
): BulletPaymentResult {
  const totalInterest = (principal * monthlyRate * months) / 100;
  const totalAmount = principal + totalInterest;
  return {
    totalInterest: Math.round(totalInterest * 100) / 100,
    totalAmount: Math.round(totalAmount * 100) / 100,
  };
}

// ─── Payment Schedule Generation ─────────────────────────────────────────────

/**
 * Build the (single-row) payment schedule for a bullet-payment loan.
 *
 * The lone payment is due `months` months after `startDate`, on
 * `paymentDay` of that target month. Caller is responsible for clamping
 * `paymentDay` to 1–28 (DB constraint).
 */
export function generateBulletPayment(
  loanId: string,
  userId: string,
  startDate: Date,
  paymentDay: number,
  months: number,
  totalAmount: number,
): PaymentInsert[] {
  const dueDate = new Date(
    startDate.getFullYear(),
    startDate.getMonth() + months,
    paymentDay,
  );

  return [
    {
      loan_id: loanId,
      user_id: userId,
      installment_number: 1,
      due_date: format(dueDate, "yyyy-MM-dd"),
      amount: totalAmount,
      is_paid: false,
    },
  ];
}
