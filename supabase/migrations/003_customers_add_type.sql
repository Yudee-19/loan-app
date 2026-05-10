-- Migration 003: pin each customer to either 'credit' (loan-giver — admin
-- borrows from them, admin owes) or 'debit' (loan-taker — admin lends to
-- them, admin is owed). All loans created against a customer inherit this type.

-- Add the column with a placeholder default so the schema change is safe
-- even if rows exist. The form sets this field explicitly on every insert.
ALTER TABLE customers
  ADD COLUMN type TEXT NOT NULL DEFAULT 'credit'
  CHECK (type IN ('credit', 'debit'));

-- Drop the default so inserts must specify the value going forward.
ALTER TABLE customers ALTER COLUMN type DROP DEFAULT;
