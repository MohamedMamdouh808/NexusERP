-- Migration: no application role can UPDATE, DELETE or TRUNCATE any append-only ledger.
--
-- The earlier append-only migrations (audit_logs 20261110000004, stock_movements
-- 20261112000004, goods_receipts/goods_receipt_lines 20261113000003/4) install
-- the row-level UPDATE/DELETE triggers and revoke TRUNCATE from PUBLIC. The
-- follow-up migrations (audit_logs 20261110000005, stock_movements
-- 20261112000009) then revoke TRUNCATE from the application roles that Supabase
-- grants explicitly. goods_receipts and goods_receipt_lines never got that
-- follow-up, so service_role kept UPDATE, DELETE and TRUNCATE on them - the
-- TRUNCATE in particular bypasses the row-level triggers entirely.
--
-- This migration closes that gap for every append-only ledger at once, and also
-- revokes UPDATE and DELETE (not only TRUNCATE) from the application roles, so
-- the privilege set matches the trigger set: an application credential can
-- neither modify a posted row through the triggers nor bypass them with a
-- statement-level TRUNCATE.
--
-- The revoke is guarded by role existence so the migration also applies to a
-- plain PostgreSQL database (local CI, a fresh environment) that has no
-- Supabase roles. The table owner retains its privileges, as documented for
-- the audit log: this protects the application credentials, not a database
-- superuser. PUBLIC is revoked too, idempotently, so the migration is
-- self-contained for every table it names.
--
-- Append-only ledgers in this system: audit_logs, stock_movements,
-- goods_receipts, goods_receipt_lines. Any new append-only table must copy
-- database/templates/append-only-table.sql and be added to the APPEND_ONLY_TABLES
-- list in scripts/verify-db-invariants.mjs.

DO $$
DECLARE
  append_only_table text;
  application_role text;
BEGIN
  FOREACH append_only_table IN ARRAY ARRAY['audit_logs', 'stock_movements', 'goods_receipts', 'goods_receipt_lines']
  LOOP
    -- PUBLIC first: removes the implicit grant every role inherits.
    EXECUTE format(
      'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE %I.%I FROM PUBLIC',
      current_schema(),
      append_only_table
    );

    -- The application roles Supabase grants explicitly. Guarded by existence
    -- so a plain PostgreSQL database without these roles still migrates.
    FOREACH application_role IN ARRAY ARRAY['service_role', 'authenticated', 'anon']
    LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = application_role) THEN
        EXECUTE format(
          'REVOKE UPDATE, DELETE, TRUNCATE ON TABLE %I.%I FROM %I',
          current_schema(),
          append_only_table,
          application_role
        );
      END IF;
    END LOOP;
  END LOOP;
END $$;
