-- Migration: the stock movement ledger becomes append-only.
--
-- The ledger is the explanation of every quantity: if a movement could be
-- changed or removed, the sum that produces the on-hand quantity would become
-- a lie, and the history could not be trusted. The enforcement is therefore in
-- the database, not in the application - the same mechanism the audit log
-- already uses (20261110000004_audit_log_append_only, 20261110000005_revoke_truncate_privilege
-- and 20261110000011_pinned_trigger_functions_and_foreign_key_indexes), copied
-- here so the two ledgers behave identically.
--
-- The functions are created schema-locally with a pinned `search_path`, exactly
-- as the audit log's are, so they resolve in the schema they were applied to
-- (the isolated test schema or the shared one) and nowhere else.
--
-- LIMITATION (documented and accepted, as it is for the audit log): the table
-- owner can drop these triggers or re-grant the TRUNCATE privilege. The
-- triggers protect against application-level mistakes and compromised
-- application credentials, not against a determined database superuser.

-- ---------------------------------------------------------------------------
-- 1. Trigger functions: reject any UPDATE or DELETE on stock_movements
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  target_schema text := current_schema();
BEGIN
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.stock_movements_reject_update()
       RETURNS trigger
       LANGUAGE plpgsql
       SET search_path = %L
       AS %L',
    target_schema,
    '',
    $fn$
      BEGIN
        RAISE EXCEPTION 'stock_movements is append-only: UPDATE is not permitted';
      END;
    $fn$
  );

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.stock_movements_reject_delete()
       RETURNS trigger
       LANGUAGE plpgsql
       SET search_path = %L
       AS %L',
    target_schema,
    '',
    $fn$
      BEGIN
        RAISE EXCEPTION 'stock_movements is append-only: DELETE is not permitted';
      END;
    $fn$
  );
END $$;

-- ---------------------------------------------------------------------------
-- 2. Attach row-level BEFORE UPDATE and BEFORE DELETE triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS stock_movements_reject_update ON "stock_movements";
CREATE TRIGGER stock_movements_reject_update
  BEFORE UPDATE ON "stock_movements"
  FOR EACH ROW
  EXECUTE FUNCTION stock_movements_reject_update();

DROP TRIGGER IF EXISTS stock_movements_reject_delete ON "stock_movements";
CREATE TRIGGER stock_movements_reject_delete
  BEFORE DELETE ON "stock_movements"
  FOR EACH ROW
  EXECUTE FUNCTION stock_movements_reject_delete();

-- ---------------------------------------------------------------------------
-- 3. Statement-level protection: no TRUNCATE
-- ---------------------------------------------------------------------------
REVOKE TRUNCATE ON TABLE "stock_movements" FROM PUBLIC;
