-- Audit trails survive actor and organization deletion (feature 006, FR-017).
--
-- The audit_logs foreign keys were created with ON DELETE CASCADE, which is wrong for an
-- append-only log in two ways: deleting a user or organization is rejected at runtime
-- because the cascade fires the append-only DELETE trigger (registering an account at
-- all then makes it undeletable), and if the trigger did not reject it, the deletion
-- would erase the record of that account's actions - the opposite of an audit trail.
--
-- Fixes both halves:
--   1. The FKs become ON DELETE SET NULL: the row survives and records that its actor
--      no longer exists. This also un-breaks suites that clean up created users.
--   2. audit_logs_reject_update() (20261110000004) rejected every UPDATE, but an FK
--      ON DELETE SET NULL action performs its nulling through an internal UPDATE one
--      referential-integrity level below the triggering statement. That depth
--      (pg_trigger_depth() > 1) is allow-listed: it can only null FK columns, it is not
--      a path to editing a log entry. Direct UPDATEs from a transaction still raise.

ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_organizationId_fkey";
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_userId_fkey";
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION audit_logs_reject_update()
RETURNS trigger AS $$
BEGIN
  -- Referential-integrity actions (ON DELETE SET NULL) execute their internal UPDATE
  -- at depth 2, beneath the RI trigger that the DELETE fired. Anything else - a
  -- client UPDATE in a transaction - arrives at depth 1 and is rejected.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_logs is append-only: UPDATE is not permitted';
END;
$$ LANGUAGE plpgsql;
