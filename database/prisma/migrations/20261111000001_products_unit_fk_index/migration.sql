-- Migration: the supporting index for the products -> units_of_measure foreign key.
--
-- The Supabase security lint (database unindexed_foreign_keys) flags a foreign
-- key whose columns have no supporting index: every insert or delete of a unit
-- of measure would otherwise seq scan products to re-check the constraint, and
-- the reference check on archival would do the same in reverse.
--
-- Schema-neutral: created in the schema the migration is applied to, so the
-- isolated test schema and the shared schema stay in parity. Every name is
-- snake_case, per the convention in database/README.md.

CREATE INDEX "products_org_unit_idx" ON "products" ("organization_id", "unit_id");
