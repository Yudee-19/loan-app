/**
 * Tailwind CSS configuration for LoanTracker.
 *
 * Custom color palette follows a financial / trust-oriented design:
 * - navy:    Primary background & headers (#1a1a2e)
 * - teal:    Accent buttons & highlights (#16a085)
 * - paid:    Green for completed payments (#27ae60)
 * - overdue: Red for overdue / warning states (#e74c3c)
 * - credit:  Warm red accent for the "Credit" tab (#c0392b)
 * - debit:   Cool green accent for the "Debit" tab (#27ae60)
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        navy: "#1a1a2e",
        teal: "#16a085",
        paid: "#27ae60",
        overdue: "#e74c3c",
        credit: "#c0392b",
        debit: "#27ae60",
        muted: "#7f8c8d",
        surface: "#f5f6fa",
      },
    },
  },
  plugins: [],
};
