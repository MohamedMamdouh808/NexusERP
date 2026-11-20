-- Migration: invoice_lines.sequence.
--
-- Invoice lines are copied from the sales order in the order the order carries
-- them. created_at cannot express that order: every line of one invoice is
-- written by a single createMany inside one transaction, so all rows share the
-- transaction timestamp, and sorting the ties by id orders them by random
-- UUID. The sequence column carries the source order deterministically.
--
-- Additive only: the feature is not deployed to production, so no backfill is
-- required; pre-existing rows (none outside development) take the default 0.
-- Row-level security stays enabled with no policies.

ALTER TABLE "invoice_lines"
  ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "invoice_lines_org_invoice_sequence_key"
  ON "invoice_lines" ("organization_id", "invoice_id", "sequence");
