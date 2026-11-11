-- Migration: align the contacts table with the Prisma datamodel.
--
-- The contacts table was created by migration 000010 with two database-level
-- defaults and one foreign key clause that the datamodel does not declare:
--
--   - "id" had DEFAULT gen_random_uuid(), while the model declares
--     `@default(uuid())`, which Prisma resolves on the CLIENT. The database
--     default was therefore redundant, and it is what a raw insert would
--     silently rely on.
--   - "updated_at" had DEFAULT CURRENT_TIMESTAMP, while the model declares
--     `@updatedAt`, which the client writes on every create and update.
--   - the organization foreign key was created without an ON UPDATE clause
--     (NO ACTION), while the model declares the Prisma default of CASCADE.
--
-- The datamodel is the truth, and this migration brings the database to it -
-- the same way migration 000008 aligned the audit and membership tables.
-- A migration that is already applied is never edited: this is a new one.
--
-- The service always writes the id and the update timestamp, so dropping the
-- database defaults changes no behaviour; it removes the second, invisible
-- source of truth for both.

ALTER TABLE "contacts" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "contacts" ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER TABLE "contacts" DROP CONSTRAINT "contacts_organization_id_fkey";
ALTER TABLE "contacts"
  ADD CONSTRAINT "contacts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
