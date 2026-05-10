-- Migration 002: Customer-first revamp
-- Adds customers entity, links loans via customer_id, drops inline person fields,
-- adds loan_transactions for Redeem / Partial / Interest events.

-- Wipe existing loan data (auth.users and user_settings preserved)
DELETE FROM payments;
DELETE FROM loans;

-- ─── customers ──────────────────────────────────────────────────────────────
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  fathers_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  caste TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_customers_user ON customers(user_id);
CREATE INDEX idx_customers_user_name ON customers(user_id, name);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own customers" ON customers FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─── loans: link to customers, drop legacy person fields ────────────────────
ALTER TABLE loans ADD COLUMN customer_id UUID NOT NULL
  REFERENCES customers(id) ON DELETE CASCADE;
ALTER TABLE loans DROP COLUMN person_name;
ALTER TABLE loans DROP COLUMN person_phone;
CREATE INDEX idx_loans_customer ON loans(customer_id);

-- ─── loan_transactions ──────────────────────────────────────────────────────
CREATE TABLE loan_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('partial', 'interest', 'redeem')),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  for_month DATE,            -- only set for kind='interest' (first day of month)
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_loan_transactions_loan ON loan_transactions(loan_id, created_at DESC);

ALTER TABLE loan_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own loan transactions" ON loan_transactions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─── trigger: update loan totals on transaction insert ──────────────────────
CREATE OR REPLACE FUNCTION update_loan_on_transaction()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.kind IN ('partial', 'interest') THEN
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

CREATE TRIGGER trg_loan_transaction_insert
  AFTER INSERT ON loan_transactions
  FOR EACH ROW EXECUTE FUNCTION update_loan_on_transaction();

-- ─── advisor fix: tighten search_path on existing trigger function ──────────
ALTER FUNCTION update_loan_on_payment() SET search_path = public;
