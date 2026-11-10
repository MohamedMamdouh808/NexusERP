-- Revoke TRUNCATE from explicit grantees on audit_logs
-- This prevents the current application user (postgres, non-superuser) from truncating
-- The table owner can re-grant to themselves - documented limitation
REVOKE TRUNCATE ON TABLE "audit_logs" FROM postgres;
REVOKE TRUNCATE ON TABLE "audit_logs" FROM service_role;
