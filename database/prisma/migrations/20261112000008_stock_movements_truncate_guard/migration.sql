-- Migration: the movement ledger refuses TRUNCATE as well.
--
-- The row-level triggers of the previous migration stop an UPDATE and a
-- DELETE, but a TRUNCATE empties the table in one statement and no row-level
-- trigger ever fires. The ledger would lose its history - the explanation of
-- every quantity - without leaving a trace.
--
-- The mechanism is the one the audit log already uses (a BEFORE TRUNCATE
-- statement-level trigger, created in the CURRENT schema with a pinned
-- search_path), so the two append-only ledgers behave identically.
--
-- LIMITATION (documented and accepted, as it is for the audit log): the table
-- owner can drop these triggers or re-grant the TRUNCATE privilege. The
-- triggers protect against application-level mistakes and compromised
-- application credentials, not against a determined database superuser.

DO $$
DECLARE
  target_schema text := current_schema();
BEGIN
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.stock_movements_reject_truncate()
       RETURNS trigger
       LANGUAGE plpgsql
       SET search_path = %L
       AS %L',
    target_schema,
    '',
    $fn$
      BEGIN
        RAISE EXCEPTION 'stock_movements is append-only: TRUNCATE is not permitted';
      END;
    $fn$
  );

  EXECUTE format('DROP TRIGGER IF EXISTS stock_movements_reject_truncate ON %I.stock_movements', target_schema);
  EXECUTE format(
    'CREATE TRIGGER stock_movements_reject_truncate
       BEFORE TRUNCATE ON %I.stock_movements
       FOR EACH STATEMENT
       EXECUTE FUNCTION %I.stock_movements_reject_truncate()',
    target_schema,
    target_schema
  );
END $$;
