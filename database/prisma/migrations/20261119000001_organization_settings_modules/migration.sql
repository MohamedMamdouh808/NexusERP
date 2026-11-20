-- Migration: organization settings and module controls (P0-F002, Feature 018).
--
-- (a) Optimistic-lock version on organizations so settings saves and module
--     toggles refuse stale writes (FR-006, FR-019).
-- (b) Per-organization module availability rows for the five switchable
--     modules, RLS enabled and no policies (FR-012, FR-013, FR-029).
-- (c) Backfill: every existing organization gets all five switchable modules
--     enabled (FR-026). The block is fenced so the invariant script can locate
--     and execute it against an already-migrated schema.
-- (d) Currency-lock trigger backstop: once any sales order, purchase order or
--     invoice exists for an organization, currency_code can no longer change
--     (FR-009, FR-010). The application also locks the organizations row under
--     TransactionService; the trigger protects every path, including direct SQL.

-- (a) ------------------------------------------------------------------------
ALTER TABLE "organizations"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- (b) ------------------------------------------------------------------------
CREATE TABLE "organization_modules" (
  "organization_id" UUID NOT NULL,
  "module_key"      VARCHAR(32) NOT NULL,
  "enabled"         BOOLEAN NOT NULL DEFAULT true,
  "version"         INTEGER NOT NULL DEFAULT 1,
  "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "organization_modules_pkey" PRIMARY KEY ("organization_id", "module_key"),
  CONSTRAINT "organization_modules_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "organization_modules_module_key_check"
    CHECK ("module_key" IN ('inventory','purchasing','sales','invoicing','reports',
                            'contacts','products','settings','audit'))
);

CREATE INDEX "organization_modules_organization_id_idx"
  ON "organization_modules" ("organization_id");

ALTER TABLE "organization_modules" ENABLE ROW LEVEL SECURITY;

-- Assert no policy was ever attached to the new table (tenant scope is enforced
-- by the session, never by a client-supplied identifier).
DO $$
DECLARE policy_count bigint;
BEGIN
  EXECUTE format(
    'SELECT count(*) FROM pg_policies WHERE schemaname = %L AND tablename = %L',
    current_schema(), 'organization_modules'
  ) INTO policy_count;
  IF policy_count > 0 THEN
    RAISE EXCEPTION
      'organization_modules RLS invariant violated: % policies; the table must have none',
      policy_count;
  END IF;
END $$;

-- (c) ------------------------------------------------------------------------
-- BACKFILL:organization_modules start
INSERT INTO "organization_modules" (
  "organization_id", "module_key", "enabled", "version", "created_at", "updated_at"
)
SELECT
  o."id",
  m."module_key",
  true,
  1,
  now(),
  now()
FROM "organizations" AS o
CROSS JOIN (
  VALUES
    ('inventory'),
    ('purchasing'),
    ('sales'),
    ('invoicing'),
    ('reports')
) AS m("module_key")
ON CONFLICT ("organization_id", "module_key") DO NOTHING;
-- BACKFILL:organization_modules end

-- (d) ------------------------------------------------------------------------
-- Schema-pinned currency-lock trigger. SET search_path so the function resolves
-- in the schema that owns the tables, even when invoked from another search path.
DO $$
DECLARE target_schema text := current_schema();
BEGIN
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.organizations_currency_lock_check()
       RETURNS trigger LANGUAGE plpgsql SET search_path = %L AS %L',
    target_schema, target_schema,
    $body$
      DECLARE org_id uuid := NEW."id";
      BEGIN
        IF OLD."currency_code" IS DISTINCT FROM NEW."currency_code" THEN
          IF EXISTS (SELECT 1 FROM "sales_orders" AS s WHERE s."organization_id" = org_id)
             OR EXISTS (SELECT 1 FROM "purchase_orders" AS p WHERE p."organization_id" = org_id)
             OR EXISTS (SELECT 1 FROM "invoices" AS i WHERE i."organization_id" = org_id)
          THEN
            RAISE EXCEPTION
              'The currency of % is locked once orders or invoices exist.',
              org_id
              USING ERRCODE = '40901';
          END IF;
        END IF;
        RETURN NEW;
      END;
    $body$
  );

  EXECUTE format(
    'DROP TRIGGER IF EXISTS organizations_currency_lock ON %I."organizations"',
    target_schema
  );
  EXECUTE format(
    'CREATE TRIGGER organizations_currency_lock
       BEFORE UPDATE OF "currency_code" ON %I."organizations"
       FOR EACH ROW EXECUTE FUNCTION %I.organizations_currency_lock_check()',
    target_schema, target_schema
  );
END $$;
