-- Align audit_logs and membership_roles with schema.prisma (FR-048: no drift).
--
-- 20261110000001 authored these columns differently from every earlier migration:
-- it used lowercase `timestamp(6)` where the schema (and migrations 20261018xxxx /
-- 20261108xxxx) use TIMESTAMPTZ(6), and it gave audit_logs.id a database-level
-- gen_random_uuid() default where the schema's @default(uuid()) is client-generated
-- (no database default, matching every other table). The schema is the source of
-- truth; this migration normalizes the database back to it, so
-- `prisma migrate diff --from-schema-datasource --to-schema-datamodel` is clean.

ALTER TABLE "audit_logs" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "audit_logs" ALTER COLUMN "createdAt" TYPE timestamptz(6) USING "createdAt" AT TIME ZONE 'UTC';
ALTER TABLE "membership_roles" ALTER COLUMN "createdAt" TYPE timestamptz(6) USING "createdAt" AT TIME ZONE 'UTC';
