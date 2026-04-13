/**
 * lib/constants.ts
 *
 * App-wide constants — colours, defaults, and formatting helpers.
 * Centralising these avoids magic values scattered across components.
 */

// ─── Color Palette ───────────────────────────────────────────────────────────

export const Colors = {
  /** Dark navy — primary background / headers */
  navy: "#1a1a2e",
  /** Teal — accent buttons, links */
  teal: "#16a085",
  /** Green — paid / success states */
  paid: "#27ae60",
  /** Red — overdue / destructive actions */
  overdue: "#e74c3c",
  /** Warm red — Credit tab accent (money going out) */
  credit: "#c0392b",
  /** Cool green — Debit tab accent (money coming in) */
  debit: "#27ae60",
  /** Muted gray for secondary text */
  muted: "#7f8c8d",
  /** Light surface background */
  surface: "#f5f6fa",
  /** Pure white */
  white: "#ffffff",
  /** Near-black text */
  text: "#2c3e50",
} as const;

// ─── Defaults ────────────────────────────────────────────────────────────────

/** Default number of days before a due date to send a reminder. */
export const DEFAULT_REMINDER_DAYS = 1;

/** PIN length expected throughout the app. */
export const PIN_LENGTH = 4;

/** Maximum day-of-month allowed for payment — avoids Feb edge cases. */
export const MAX_PAYMENT_DAY = 28;

// ─── Currency Formatter ──────────────────────────────────────────────────────

/**
 * Format a number as Indian Rupees (e.g. ₹1,00,000.00).
 * Uses the 'en-IN' locale for the Indian numbering system.
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);
}
