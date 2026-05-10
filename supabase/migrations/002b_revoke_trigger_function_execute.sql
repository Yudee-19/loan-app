-- Migration 002b: lock down SECURITY DEFINER trigger helpers.
-- These functions are only meant to be invoked by triggers, never via REST.
REVOKE EXECUTE ON FUNCTION public.update_loan_on_payment() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_loan_on_transaction() FROM anon, authenticated;
