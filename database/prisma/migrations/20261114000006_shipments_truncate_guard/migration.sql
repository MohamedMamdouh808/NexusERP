-- Migration: shipments refuse TRUNCATE as well.
--
-- The row-level triggers of the shipment migrations stop an UPDATE and a
-- DELETE, but a TRUNCATE empties a table in one statement and no row-level
-- trigger ever fires. A shipment is the explanation of every quantity it
-- moved - the stock history without it is a ledger nobody can audit.
--
-- The mechanism is the one the movement ledger uses (a BEFORE TRUNCATE
-- statement-level trigger, created in the CURRENT schema with a pinned
-- search_path), so the three append-only ledgers behave identically.
--
-- LIMITATION (documented and accepted, as it is for the audit log and the
-- movement ledger): the table owner can drop these triggers or re-grant the
-- TRUNCATE privilege. The triggers protect against application-level mistakes
-- and compromised application credentials, not against a determined database
-- superuser.

DO $$
DECLARE
  target_schema text := current_schema();
BEGIN
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.shipments_reject_truncate()
       RETURNS trigger
       LANGUAGE plpgsql
       SET search_path = %L
       AS %L',
    target_schema,
    '',
    $fn$
      BEGIN
        RAISE EXCEPTION 'shipments is append-only: TRUNCATE is not permitted';
      END;
    $fn$
  );
  EXECUTE format('DROP TRIGGER IF EXISTS shipments_reject_truncate ON %I.shipments', target_schema);
  EXECUTE format(
    'CREATE TRIGGER shipments_reject_truncate
       BEFORE TRUNCATE ON %I.shipments
       FOR EACH STATEMENT
       EXECUTE FUNCTION %I.shipments_reject_truncate()',
    target_schema,
    target_schema,
    target_schema
  );

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.shipment_lines_reject_truncate()
       RETURNS trigger
       LANGUAGE plpgsql
       SET search_path = %L
       AS %L',
    target_schema,
    '',
    $fn$
      BEGIN
        RAISE EXCEPTION 'shipment_lines is append-only: TRUNCATE is not permitted';
      END;
    $fn$
  );
  EXECUTE format('DROP TRIGGER IF EXISTS shipment_lines_reject_truncate ON %I.shipment_lines', target_schema);
  EXECUTE format(
    'CREATE TRIGGER shipment_lines_reject_truncate
       BEFORE TRUNCATE ON %I.shipment_lines
       FOR EACH STATEMENT
       EXECUTE FUNCTION %I.shipment_lines_reject_truncate()',
    target_schema,
    target_schema,
    target_schema
  );
END $$;
