-- Migration: one sequence row per organization and document kind.
--
-- The purchasing numbers are allocated on FIRST USE, inside the transaction
-- that creates the document, under a per-organization advisory lock. Without a
-- unique constraint, two organizations' first receipts - or one organization's
-- first two receipts - could each create a row and the sequence would fork.
--
-- The constraint is what makes the race impossible: the second insert fails,
-- the transaction rolls back, and the caller retries against the row that is
-- already there.
--
-- Existing rows are kept: the contacts and the adjustment sequences already in
-- use must keep their values, and no organization has two rows for the same
-- name today, so the constraint can be added without touching any data.
--
-- The table's columns are the grandfathered camelCase ones (`organizationId`,
-- `currentValue`, `createdAt`) that the earliest migration created; the
-- constraint is added on the real column names.
--
-- Row-level security is enabled with NO policies on this table already; the
-- change here is the constraint alone.

ALTER TABLE "document_sequences"
  ADD CONSTRAINT "document_sequences_organization_id_name_key"
  UNIQUE ("organizationId", "name");
