-- Migration: organizations.default_payment_terms_days.
--
-- The default due date of an operational invoice is issue date plus this many
-- days. Read-only in this feature (exposed on GET /organizations/current); the
-- Organization settings feature owns editing. Additive column, immutable
-- migration: never edit this file afterwards.
--
-- Schema-neutral: created in the schema the migration is applied to, so the
-- isolated test schema and the shared schema stay in parity.

ALTER TABLE "organizations"
  ADD COLUMN "default_payment_terms_days" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_default_payment_terms_days_range"
  CHECK ("default_payment_terms_days" >= 0 AND "default_payment_terms_days" <= 365);
