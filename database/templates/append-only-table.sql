-- Template: append-only table (copy this into a new migration and fill in the table name).
--
-- An append-only table rejects UPDATE, DELETE and TRUNCATE at the database level:
-- the row-level triggers make an UPDATE or DELETE a failed transaction, and the
-- revoked privileges remove the statement-level TRUNCATE that would bypass them.
-- The application database role is granted INSERT and SELECT only.
--
-- Every append-only table in this system must:
--   1. enable row-level security with no policies;
--   2. carry a BEFORE UPDATE trigger and a BEFORE DELETE trigger that raise;
--   3. carry a BEFORE TRUNCATE statement-level trigger that raises;
--   4. revoke UPDATE, DELETE and TRUNCATE from PUBLIC and from every
--      application role (service_role, authenticated, anon), guarded by role
--      existence so the migration also runs on plain PostgreSQL;
--   5. be listed in APPEND_ONLY_TABLES in scripts/verify-db-invariants.mjs.
--
-- Replace {{TABLE}} with the table name and {{SCHEMA}} with current_schema()
-- (the DO block pins the schema at runtime). Keep the triggers schema-pinned
-- (SET search_path) so they resolve in the schema that owns the table.

DO $$
DECLARE
  target_schema text := current_schema();
  application_role text;
BEGIN
  -- 1. Row-level security with no policies.
  EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', target_schema, '{{TABLE}}');

  -- 2. Row-level UPDATE/DELETE rejection.
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.{{TABLE}}_reject_update()
       RETURNS trigger LANGUAGE plpgsql SET search_path = %L AS %L',
    target_schema, '', 'BEGIN RAISE EXCEPTION ''{{TABLE}} is append-only: UPDATE is not permitted''; END;'
  );
  EXECUTE format('DROP TRIGGER IF EXISTS {{TABLE}}_reject_update ON %I.{{TABLE}}', target_schema);
  EXECUTE format(
    'CREATE TRIGGER {{TABLE}}_reject_update BEFORE UPDATE ON %I.{{TABLE}}
       FOR EACH ROW EXECUTE FUNCTION %I.{{TABLE}}_reject_update()',
    target_schema, target_schema
  );

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.{{TABLE}}_reject_delete()
       RETURNS trigger LANGUAGE plpgsql SET search_path = %L AS %L',
    target_schema, '', 'BEGIN RAISE EXCEPTION ''{{TABLE}} is append-only: DELETE is not permitted''; END;'
  );
  EXECUTE format('DROP TRIGGER IF EXISTS {{TABLE}}_reject_delete ON %I.{{TABLE}}', target_schema);
  EXECUTE format(
    'CREATE TRIGGER {{TABLE}}_reject_delete BEFORE DELETE ON %I.{{TABLE}}
       FOR EACH ROW EXECUTE FUNCTION %I.{{TABLE}}_reject_delete()',
    target_schema, target_schema
  );

  -- 3. Statement-level TRUNCATE rejection.
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.{{TABLE}}_reject_truncate()
       RETURNS trigger LANGUAGE plpgsql SET search_path = %L AS %L',
    target_schema, '', 'BEGIN RAISE EXCEPTION ''{{TABLE}} is append-only: TRUNCATE is not permitted''; END;'
  );
  EXECUTE format('DROP TRIGGER IF EXISTS {{TABLE}}_reject_truncate ON %I.{{TABLE}}', target_schema);
  EXECUTE format(
    'CREATE TRIGGER {{TABLE}}_reject_truncate BEFORE TRUNCATE ON %I.{{TABLE}}
       FOR EACH STATEMENT EXECUTE FUNCTION %I.{{TABLE}}_reject_truncate()',
    target_schema, target_schema
  );

  -- 4. Revoke UPDATE, DELETE and TRUNCATE from PUBLIC and the application roles.
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON TABLE %I.%I FROM PUBLIC',
    target_schema, '{{TABLE}}');

  FOREACH application_role IN ARRAY ARRAY['service_role', 'authenticated', 'anon']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = application_role) THEN
      EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON TABLE %I.%I FROM %I',
        target_schema, '{{TABLE}}', application_role);
    END IF;
  END LOOP;
END $$;
