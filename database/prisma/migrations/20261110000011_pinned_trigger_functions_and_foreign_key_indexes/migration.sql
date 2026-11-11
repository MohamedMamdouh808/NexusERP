-- Migration: schema-local trigger functions with a pinned search_path, and the
-- foreign keys that had no supporting index.
--
-- 1. The append-only trigger functions are recreated in the CURRENT schema with
--    `SET search_path = ''` and schema-qualified references, and the triggers are
--    re-pointed at them.
--
--    Why this is a new migration and not an edit of 000009: a migration that is
--    already applied is never edited. 000009 created its copies with an explicit
--    `public.` prefix, so an isolated schema kept the unpinned copies an earlier
--    migration had made in that schema, and its triggers ended up calling a
--    function that lives in another schema - a test schema that depends on
--    `public` is exactly what the isolated-schema design forbids.
--
-- 2. The foreign keys that had no index with the key's columns in the leading
--    position: a foreign key without an index makes every parent-side delete
--    and update scan the child table.
--
--    Every object created here is snake_case, per the naming convention in
--    database/README.md. The indexed COLUMNS are pre-existing camelCase columns
--    of tables that predate the convention; an index over them does not add a
--    new column name.

-- ---------------------------------------------------------------------------
-- 1. Trigger functions, pinned, in the schema the migration is applied to
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  target_schema text := current_schema();
BEGIN
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.audit_logs_reject_update()
       RETURNS trigger
       LANGUAGE plpgsql
       SET search_path = %L
       AS %L',
    target_schema,
    '',
    $fn$
      BEGIN
        -- Referential-integrity actions (ON DELETE SET NULL) execute their
        -- internal UPDATE at depth 2, beneath the RI trigger that the DELETE
        -- fired. Anything else - a client UPDATE in a transaction - arrives at
        -- depth 1 and is rejected.
        IF pg_catalog.pg_trigger_depth() > 1 THEN
          RETURN NEW;
        END IF;
        RAISE EXCEPTION 'audit_logs is append-only: UPDATE is not permitted';
      END;
    $fn$
  );

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.audit_logs_reject_delete()
       RETURNS trigger
       LANGUAGE plpgsql
       SET search_path = %L
       AS %L',
    target_schema,
    '',
    $fn$
      BEGIN
        RAISE EXCEPTION 'audit_logs is append-only: DELETE is not permitted';
      END;
    $fn$
  );

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.audit_logs_reject_truncate()
       RETURNS trigger
       LANGUAGE plpgsql
       SET search_path = %L
       AS %L',
    target_schema,
    '',
    $fn$
      BEGIN
        RAISE EXCEPTION 'audit_logs is append-only: TRUNCATE is not permitted';
      END;
    $fn$
  );

  -- The triggers of THIS schema call THIS schema's functions.
  EXECUTE format('DROP TRIGGER IF EXISTS audit_logs_reject_update ON %I.audit_logs', target_schema);
  EXECUTE format(
    'CREATE TRIGGER audit_logs_reject_update
       BEFORE UPDATE ON %I.audit_logs
       FOR EACH ROW
       EXECUTE FUNCTION %I.audit_logs_reject_update()',
    target_schema,
    target_schema
  );

  EXECUTE format('DROP TRIGGER IF EXISTS audit_logs_reject_delete ON %I.audit_logs', target_schema);
  EXECUTE format(
    'CREATE TRIGGER audit_logs_reject_delete
       BEFORE DELETE ON %I.audit_logs
       FOR EACH ROW
       EXECUTE FUNCTION %I.audit_logs_reject_delete()',
    target_schema,
    target_schema
  );

  EXECUTE format('DROP TRIGGER IF EXISTS audit_logs_reject_truncate ON %I.audit_logs', target_schema);
  EXECUTE format(
    'CREATE TRIGGER audit_logs_reject_truncate
       BEFORE TRUNCATE ON %I.audit_logs
       FOR EACH STATEMENT
       EXECUTE FUNCTION %I.audit_logs_reject_truncate()',
    target_schema,
    target_schema
  );
END $$;

-- ---------------------------------------------------------------------------
-- 2. Foreign keys that had no supporting index
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "membership_roles_membership_id_organization_id_idx"
  ON "membership_roles" ("membershipId", "organizationId");

CREATE INDEX IF NOT EXISTS "membership_roles_role_id_organization_id_idx"
  ON "membership_roles" ("roleId", "organizationId");

CREATE INDEX IF NOT EXISTS "role_permissions_permission_id_idx"
  ON "role_permissions" ("permissionId");

CREATE INDEX IF NOT EXISTS "sessions_user_id_idx"
  ON "sessions" ("userId");

CREATE INDEX IF NOT EXISTS "sessions_membership_id_idx"
  ON "sessions" ("membershipId");
