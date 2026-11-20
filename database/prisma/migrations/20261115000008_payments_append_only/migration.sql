-- Migration: no application role can UPDATE, DELETE or TRUNCATE the payment ledgers.
--
-- payments, payment_allocations and payment_reversals are append-only: the
-- BEFORE UPDATE/DELETE triggers below reject every row-level change, and the
-- BEFORE TRUNCATE triggers reject every statement-level change. This migration
-- also revokes UPDATE, DELETE and TRUNCATE from PUBLIC and from the application
-- roles Supabase grants explicitly, so the privilege set matches the trigger
-- set: an application credential can neither modify a posted row through the
-- triggers nor bypass them with a statement-level TRUNCATE.
--
-- The revoke is guarded by role existence so the migration also applies to a
-- plain PostgreSQL database (local CI, a fresh environment) that has no
-- Supabase roles. PUBLIC is revoked too, idempotently, so the migration is
-- self-contained.
--
-- Append-only ledgers in this system: audit_logs, stock_movements,
-- goods_receipts, goods_receipt_lines, shipments, shipment_lines,
-- invoice_lines (20261115000004), payments, payment_allocations,
-- payment_reversals (this migration).
--
-- All functions are schema-pinned and run with an empty search_path.

DO $$
DECLARE
  target_schema text := current_schema();
  append_only_table text;
  application_role text;
BEGIN
  FOREACH append_only_table IN ARRAY ARRAY['payments', 'payment_allocations', 'payment_reversals']
  LOOP
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION %I.%I_reject_update()
         RETURNS trigger
         LANGUAGE plpgsql
         SET search_path = %L
         AS %L',
      target_schema,
      append_only_table,
      '',
      $fn$
        BEGIN
          RAISE EXCEPTION '% is append-only: UPDATE is not permitted', TG_TABLE_NAME;
        END;
      $fn$
    );
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION %I.%I_reject_delete()
         RETURNS trigger
         LANGUAGE plpgsql
         SET search_path = %L
         AS %L',
      target_schema,
      append_only_table,
      '',
      $fn$
        BEGIN
          RAISE EXCEPTION '% is append-only: DELETE is not permitted', TG_TABLE_NAME;
        END;
      $fn$
    );
    EXECUTE format(
      'CREATE OR REPLACE FUNCTION %I.%I_reject_truncate()
         RETURNS trigger
         LANGUAGE plpgsql
         SET search_path = %L
         AS %L',
      target_schema,
      append_only_table,
      '',
      $fn$
        BEGIN
          RAISE EXCEPTION '% is append-only: TRUNCATE is not permitted', TG_TABLE_NAME;
        END;
      $fn$
    );

    EXECUTE format('DROP TRIGGER IF EXISTS %I_reject_update ON %I.%I', append_only_table, target_schema, append_only_table);
    EXECUTE format(
      'CREATE TRIGGER %I_reject_update
         BEFORE UPDATE ON %I.%I
         FOR EACH ROW
         EXECUTE FUNCTION %I.%I_reject_update()',
      append_only_table,
      target_schema,
      append_only_table,
      target_schema,
      append_only_table
    );
    EXECUTE format('DROP TRIGGER IF EXISTS %I_reject_delete ON %I.%I', append_only_table, target_schema, append_only_table);
    EXECUTE format(
      'CREATE TRIGGER %I_reject_delete
         BEFORE DELETE ON %I.%I
         FOR EACH ROW
         EXECUTE FUNCTION %I.%I_reject_delete()',
      append_only_table,
      target_schema,
      append_only_table,
      target_schema,
      append_only_table
    );
    EXECUTE format('DROP TRIGGER IF EXISTS %I_reject_truncate ON %I.%I', append_only_table, target_schema, append_only_table);
    EXECUTE format(
      'CREATE TRIGGER %I_reject_truncate
         BEFORE TRUNCATE ON %I.%I
         FOR EACH STATEMENT
         EXECUTE FUNCTION %I.%I_reject_truncate()',
      append_only_table,
      target_schema,
      append_only_table,
      target_schema,
      append_only_table
    );

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
