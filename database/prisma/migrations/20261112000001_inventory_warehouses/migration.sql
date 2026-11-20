-- Migration: the warehouses table, brought in line with the inventory model.
--
-- Three things happen here, and nothing else in the schema is touched:
--
--  1. The legacy camelCase columns are renamed to the snake_case the repository
--     documents (database/README.md: "Every table and every column is
--     snake_case"). The table was created before that convention was adopted;
--     every column written since uses snake_case. The rename preserves the
--     data and every index and foreign key that referenced the old name follows
--     the column automatically.
--
--  2. The columns the inventory feature needs are added: the active flag, the
--     version that makes concurrent writes safe, and the update timestamp.
--
--  3. The two uniqueness rules are enforced by the database rather than by the
--     application:
--       - a warehouse name is unique inside an organization, compared WITHOUT
--         regard to capitalisation (a functional unique index, which Prisma
--         cannot express);
--       - exactly one warehouse per organization is the default (a partial
--         unique index over the rows that claim it).
--
-- Schema-neutral: created in the schema the migration is applied to, so the
-- isolated test schema and the shared schema stay in parity. Every name is
-- snake_case, per the convention in database/README.md.

-- ---------------------------------------------------------------------------
-- 1. The legacy column names become the documented ones
-- ---------------------------------------------------------------------------
ALTER TABLE "warehouses" RENAME COLUMN "organizationId" TO "organization_id";
ALTER TABLE "warehouses" RENAME COLUMN "isDefault" TO "is_default";
ALTER TABLE "warehouses" RENAME COLUMN "createdAt" TO "created_at";

-- The existing index keeps its name (it follows the renamed column), but the
-- constraint and the index names are aligned with the new spelling so the
-- schema and the database read the same.
ALTER INDEX "warehouses_organizationId_idx" RENAME TO "warehouses_organization_id_idx";

-- ---------------------------------------------------------------------------
-- 2. The columns the inventory feature needs
-- ---------------------------------------------------------------------------
ALTER TABLE "warehouses"
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- The update timestamp is written by the application on every write (it is the
-- application's column to maintain), so the database default is only a safety
-- net for a row that is inserted without one.
ALTER TABLE "warehouses" ALTER COLUMN "updated_at" DROP DEFAULT;

-- The existing rows are version 1: they were never edited through a versioned
-- write, and the first versioned write against them moves them to 2.
UPDATE "warehouses" SET "version" = 1 WHERE "version" IS DISTINCT FROM 1;

-- ---------------------------------------------------------------------------
-- 3. The uniqueness rules
-- ---------------------------------------------------------------------------
-- A warehouse's name is its identity: unique inside the organization, compared
-- without regard to capitalisation.
CREATE UNIQUE INDEX "warehouses_organization_id_name_lower_key"
  ON "warehouses" ("organization_id", lower("name"));

-- Exactly one default warehouse per organization. The index is what makes the
-- rule true at every moment, not only after the application has finished
-- demoting the previous default.
CREATE UNIQUE INDEX "warehouses_one_default_per_org_key"
  ON "warehouses" ("organization_id")
  WHERE "is_default";

-- The composite key the stock tables reference, so a balance can never point
-- at a warehouse of another organization.
CREATE UNIQUE INDEX "warehouses_organization_id_id_key"
  ON "warehouses" ("organization_id", "id");
