-- Migration: no application role can UPDATE, DELETE or TRUNCATE the sales append-only ledgers.
--
-- The earlier append-only migrations (shipments 20261114000004, shipment_lines
-- 20261114000005) install the row-level UPDATE/DELETE triggers and revoke
-- TRUNCATE from PUBLIC. This follow-up revokes UPDATE, DELETE and TRUNCATE
-- from the application roles that Supabase grants explicitly, so the privilege
-- set matches the trigger set: an application credential can neither modify a
-- posted row through the triggers nor bypass them with a statement-level
-- TRUNCATE.
--
-- The revoke is guarded by role existence so the migration also applies to a
-- plain PostgreSQL database (local CI, a fresh environment) that has no
-- Supabase roles. PUBLIC is revoked too, idempotently, so the migration is
-- self-contained.
--
-- Append-only ledgers in this system: audit_logs, stock_movements,
-- goods_receipts, goods_receipt_lines, shipments, shipment_lines.

DO $$
DECLARE
  append_only_table text;
  application_role text;
BEGIN
  FOREACH append_only_table IN ARRAY ARRAY['shipments', 'shipment_lines']
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
