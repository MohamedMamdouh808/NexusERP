-- Audit log append-only enforcement at the database level (feature 006).
--
-- Adds triggers that reject UPDATE and DELETE (row level) on audit_logs, and
-- revokes TRUNCATE privilege to prevent statement-level truncation.
-- This enforces FR-017: the audit log is append-only at the database level,
-- not just in application code.
--
-- LIMITATION: The table owner (the database superuser that connects as postgres)
-- can drop these triggers or re-grant TRUNCATE privilege. Triggers protect against
-- application-level mistakes and compromised application credentials, not against
-- a determined database superuser. This is documented and accepted.

-- ---------------------------------------------------------------------------
-- 1. Trigger function: reject any UPDATE on audit_logs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_logs_reject_update()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: UPDATE is not permitted';
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 2. Trigger function: reject any DELETE on audit_logs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_logs_reject_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: DELETE is not permitted';
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 3. Attach row-level BEFORE UPDATE and BEFORE DELETE triggers
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS audit_logs_reject_update ON "audit_logs";
CREATE TRIGGER audit_logs_reject_update
  BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW
  EXECUTE FUNCTION audit_logs_reject_update();

DROP TRIGGER IF EXISTS audit_logs_reject_delete ON "audit_logs";
CREATE TRIGGER audit_logs_reject_delete
  BEFORE DELETE ON "audit_logs"
  FOR EACH ROW
  EXECUTE FUNCTION audit_logs_reject_delete();

-- ---------------------------------------------------------------------------
-- 4. Revoke TRUNCATE privilege on audit_logs from all roles except the table
--    owner. Public/revocation prevents accidental or compromised truncation.
--    The table owner (postgres superuser) can still truncate - this is the
--    documented limit of database-level enforcement.
-- ---------------------------------------------------------------------------
REVOKE TRUNCATE ON TABLE "audit_logs" FROM PUBLIC;
