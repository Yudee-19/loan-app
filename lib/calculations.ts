/**
 * lib/calculations.ts
 *
 * Pure math helpers for loan interest and EMI calculations.
 *
 * We use **simple interest** (not compound) per the project spec:
 *   Total Interest = P × R × T / (12 × 100)
 *   EMI = (P + Total Interest) / T
 *
 * where P = principal, R = annual rate (%), T = tenure in months.
 */

import { format } from "date-fns";
import type { PaymentInsert } from "@/types";

// ─── Interest Calculation ────────────────────────────────────────────────────

export interface InterestResult {
  /** Total interest over the full tenure */
  totalInterest: number;
  /** Principal + total interest */
  totalAmount: number;
  /** Equal Monthly Installment */
  emi: number;
}

/**
 * Calculate simple interest, total repayable amount, and EMI.
 *
 * @param principal     - The original loan amount.
 * @param annualRate    - Annual rate of interest as a percentage (e.g. 12 for 12 %).
 * @param tenureMonths  - Number of monthly installments.
 */
export function calculateSimpleInterest(
  principal: number,
  annualRate: number,
  tenureMonths: number
): InterestResult {
  // Simple interest formula: I = P * R * T / (12 * 100)
  const totalInterest = (principal * annualRate * tenureMonths) / (12 * 100);
  const totalAmount = principal + totalInterest;
  const emi = totalAmount / tenureMonths;

  return {
    totalInterest: Math.round(totalInterest * 100) / 100,
    totalAmount: Math.round(totalAmount * 100) / 100,
    emi: Math.round(emi * 100) / 100,
  };
}

// ─── Payment Schedule Generation ─────────────────────────────────────────────

/**
 * Generate the full payment schedule for a loan.
 *
 * Each payment falls on `paymentDay` of the month, starting from the month
 * after `startDate`.  For example, if the loan starts on 15 Jan with
 * paymentDay = 5, the first EMI is due on 5 Feb.
 *
 * @param loanId       - UUID of the parent loan row.
 * @param userId       - UUID of the owning user (denormalised for RLS).
 * @param startDate    - Loan disbursement date.
 * @param paymentDay   - Day of month for each installment (1–28).
 * @param tenureMonths - Total number of installments.
 * @param emi          - Calculated EMI amount.
 */
export function generatePaymentSchedule(
  loanId: string,
  userId: string,
  startDate: Date,
  paymentDay: number,
  tenureMonths: number,
  emi: number
): PaymentInsert[] {
  const payments: PaymentInsert[] = [];

  for (let i = 0; i < tenureMonths; i++) {
    // Month-by-month from the start date, offset by (i + 1)
    const dueDate = new Date(
      startDate.getFullYear(),
      startDate.getMonth() + i + 1,
      paymentDay
    );

    payments.push({
      loan_id: loanId,
      user_id: userId,
      installment_number: i + 1,
      due_date: format(dueDate, "yyyy-MM-dd"),
      amount: emi,
      is_paid: false,
    });
  }

  return payments;
}
