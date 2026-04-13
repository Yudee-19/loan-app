-- ============================================================================
-- LoanTracker — Initial Database Schema
-- ============================================================================
-- Run this migration in the Supabase SQL Editor to set up all tables,
-- indexes, RLS policies, and the auto-update trigger.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- Table: loans
-- Stores every loan, tagged as 'credit' (user owes) or 'debit' (user is owed).
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 'credit' = user TOOK a loan (user owes money)
  -- 'debit'  = user GAVE a loan (user is owed money)
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),

  person_name TEXT NOT NULL,
  person_phone TEXT,

  -- Original loan amount
  principal_amount NUMERIC(12, 2) NOT NULL CHECK (principal_amount > 0),

  -- Annual rate of interest as a percentage (e.g. 12 means 12%)
  rate_of_interest NUMERIC(5, 2) NOT NULL CHECK (rate_of_interest >= 0),

  -- Day of each month when the installment is due (capped at 28 to avoid
  -- month-end edge cases like Feb 29/30/31)
  payment_day_of_month INTEGER NOT NULL CHECK (payment_day_of_month BETWEEN 1 AND 28),

  -- Date the loan was disbursed
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Total number of monthly installments
  tenure_months INTEGER NOT NULL CHECK (tenure_months > 0),

  -- Running totals updated by the payment trigger
  total_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
  remaining_amount NUMERIC(12, 2) NOT NULL, -- initialised to principal + total interest

  -- Flipped to TRUE when remaining_amount reaches 0
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup: all loans for a user filtered by type (used by the Credit/Debit tabs)
CREATE INDEX idx_loans_user_type ON loans(user_id, type);

-- Row Level Security — users can only see/modify their own loans
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own loans"
  ON loans FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────────────────────
-- Table: payments
-- Each row is one monthly installment belonging to a loan.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  -- Denormalised user_id for RLS (avoids a JOIN in every policy check)
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  installment_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,

  is_paid BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at TIMESTAMPTZ,

  -- expo-notifications ID — stored so we can cancel the reminder when paid
  notification_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup: all payments for a specific loan
CREATE INDEX idx_payments_loan ON payments(loan_id);

-- Fast lookup: upcoming/overdue payments for a user (notification scheduling, dashboard)
CREATE INDEX idx_payments_due ON payments(user_id, due_date, is_paid);

-- Row Level Security
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own payments"
  ON payments FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────────────────────
-- Table: user_settings
-- Per-user preferences: PIN lock and notification config.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Bcrypt hash of the 4-digit PIN.  NULL means PIN lock is not enabled.
  pin_hash TEXT,

  -- Whether the user wants payment reminder notifications
  notification_enabled BOOLEAN NOT NULL DEFAULT TRUE,

  -- How many days before a due date the reminder should fire
  reminder_days_before INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own settings"
  ON user_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ────────────────────────────────────────────────────────────────────────────
-- Trigger Function: update_loan_on_payment
--
-- Automatically adjusts loans.total_paid and loans.remaining_amount when a
-- payment's is_paid flag is toggled.  Also sets is_completed = TRUE when
-- the remaining balance reaches zero.
--
-- Handles both directions:
--   • Marking a payment as paid  → decreases remaining, increases total_paid
--   • Un-marking a payment       → reverses the above
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_loan_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  -- Payment was just marked as PAID
  IF NEW.is_paid = TRUE AND OLD.is_paid = FALSE THEN
    UPDATE loans
    SET total_paid = total_paid + NEW.amount,
        remaining_amount = remaining_amount - NEW.amount,
        updated_at = NOW()
    WHERE id = NEW.loan_id;

    -- Auto-complete the loan when fully paid off
    UPDATE loans
    SET is_completed = TRUE
    WHERE id = NEW.loan_id AND remaining_amount <= 0;
  END IF;

  -- Payment was UN-MARKED (set back to unpaid) — reverse the totals
  IF NEW.is_paid = FALSE AND OLD.is_paid = TRUE THEN
    UPDATE loans
    SET total_paid = total_paid - NEW.amount,
        remaining_amount = remaining_amount + NEW.amount,
        is_completed = FALSE,
        updated_at = NOW()
    WHERE id = NEW.loan_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_payment_update
  AFTER UPDATE OF is_paid ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_loan_on_payment();
