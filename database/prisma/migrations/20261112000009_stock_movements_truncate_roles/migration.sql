-- Migration: no application role can TRUNCATE the movement ledger.
--
-- The previous migration revoked TRUNCATE from PUBLIC, which removes the
-- implicit grant every role inherits. Supabase also grants the table privileges
-- explicitly to `service_role`, so that role kept the ability to empty the
-- ledger in one statement. The row-level UPDATE/DELETE triggers never fire for
-- a TRUNCATE, so this is the remaining hole in the append-only guarantee.
--
-- The revoke is guarded by role existence so the migration also applies to a
-- plain PostgreSQL database (local CI, a fresh environment) that has no
-- Supabase roles. The table owner retains its privileges, as documented for the
-- audit log: this protects the application credentials, not a database
-- superuser.

DO $$
DECLARE
  application_role text;
BEGIN
  FOREACH application_role IN ARRAY ARRAY['service_role', 'authenticated', 'anon']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = application_role) THEN
      EXECUTE format(
        'REVOKE TRUNCATE ON TABLE %I.stock_movements FROM %I',
        current_schema(),
        application_role
      );
    END IF;
  END LOOP;
END $$;
