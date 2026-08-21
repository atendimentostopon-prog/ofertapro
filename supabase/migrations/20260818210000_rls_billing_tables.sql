-- supabase/migrations/20260818210000_rls_billing_tables.sql
-- Fix 1: enable RLS on billing tables to prevent PII enumeration by authenticated users
-- service_role bypasses RLS by design; anon/authenticated users see nothing without explicit policies

ALTER TABLE pending_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
