-- Migration: invoicing RLS parity check.
--
-- The five invoicing tables were created with ENABLE ROW LEVEL SECURITY and no
-- policies (20261115000002 … 20261115000007, exactly like the sales series).
-- This step mirrors the historical enable_rls_all_tables catch-up: it enables
-- RLS again (idempotent) and asserts that no policy has ever been attached, so
-- the tenant scope stays enforced by the session - never by a client-supplied
-- identifier - and the schema stays in parity between the isolated test schema
-- and the shared schema.
--
-- A policy appearing here would silently weaken tenant isolation (Principle I),
-- so the migration refuses to run if one exists.

DO $$
DECLARE
  invoicing_table text;
  policy_count bigint;
BEGIN
  FOREACH invoicing_table IN ARRAY ARRAY[
    'invoices', 'invoice_lines', 'payments', 'payment_allocations', 'payment_reversals'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      current_schema(),
      invoicing_table
    );

    EXECUTE format(
      'SELECT count(*) FROM pg_policies WHERE schemaname = %L AND tablename = %L',
      current_schema(),
      invoicing_table
    ) INTO policy_count;

    IF policy_count > 0 THEN
      RAISE EXCEPTION
        'invoicing RLS invariant violated: % has % policies; the invoicing tables must have none',
        invoicing_table,
        policy_count;
    END IF;
  END LOOP;
END $$;
