-- Migration 004:
--   - Add 'partial_interest' kind to loan_transactions.
--   - Update trigger to treat 'partial_interest' the same as 'partial'/'interest'
--     (it deducts from remaining_amount).
--   - Add due_date (admin-editable acceptance deadline) to loans.
--   - Add item_type (mortgage item description, free text) to loans.

-- ─── loan_transactions: extend kind ──────────────────────────────────────────
ALTER TABLE loan_transactions DROP CONSTRAINT loan_transactions_kind_check;
ALTER TABLE loan_transactions ADD CONSTRAINT loan_transactions_kind_check
  CHECK (kind IN ('partial', 'interest', 'redeem', 'partial_interest'));

-- Refresh trigger function so partial_interest also reduces remaining_amount.
CREATE OR REPLACE FUNCTION update_loan_on_transaction()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.kind IN ('partial', 'interest', 'partial_interest') THEN
    UPDATE loans
    SET total_paid       = total_paid + NEW.amount,
        remaining_amount = GREATEST(0, remaining_amount - NEW.amount),
        is_completed     = (remaining_amount - NEW.amount) <= 0,
        updated_at       = NOW()
    WHERE id = NEW.loan_id;
  ELSIF NEW.kind = 'redeem' THEN
    UPDATE loans
    SET total_paid       = total_paid + NEW.amount,
        remaining_amount = 0,
        is_completed     = TRUE,
        updated_at       = NOW()
    WHERE id = NEW.loan_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Re-revoke EXECUTE on the rebuilt function (CREATE OR REPLACE resets grants).
REVOKE EXECUTE ON FUNCTION public.update_loan_on_transaction() FROM anon, authenticated;

-- ─── loans: add due_date + item_type ─────────────────────────────────────────
-- due_date is the admin-editable acceptance deadline (last date the lender
-- will accept the bullet payment). Independent of tenure_months, which still
-- governs interest calculation. Default placeholder so NOT NULL is safe even
-- on existing rows; the form always sets this field on insert.
ALTER TABLE loans
  ADD COLUMN due_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN item_type TEXT;
ALTER TABLE loans ALTER COLUMN due_date DROP DEFAULT;
