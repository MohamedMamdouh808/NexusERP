-- Migration: invoice_lines.
--
-- One product line on an operational invoice. The line quantities are copied
-- from the sales order at invoice creation; there is no line-mutation path in
-- this feature. Insert-only is enforced by triggers installed by
-- 20261115000004_invoices_immutability.
--
-- The rules live in the database:
--   - quantity is strictly positive;
--   - unit price and line total are never negative;
--   - one product per invoice.
--
-- The composite key (organization_id, id) is kept for future composite foreign
-- keys; the index (organization_id, invoice_id) serves the detail reads.
--
-- Every relation is a COMPOSITE foreign key over (organization_id, id), except
-- when the line's invoice is deleted: the lines cascade with it.
-- Row-level security is enabled with NO policies.

CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_price" DECIMAL(14,4) NOT NULL,
    "line_total" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoice_lines_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "invoice_lines_unit_price_not_negative" CHECK ("unit_price" >= 0),
    CONSTRAINT "invoice_lines_line_total_not_negative" CHECK ("line_total" >= 0)
);

CREATE UNIQUE INDEX "invoice_lines_org_invoice_product_key"
  ON "invoice_lines" ("organization_id", "invoice_id", "product_id");

-- The composite key future composite foreign keys may build on.
CREATE UNIQUE INDEX "invoice_lines_organization_id_id_key"
  ON "invoice_lines" ("organization_id", "id");

CREATE INDEX "invoice_lines_org_invoice_idx"
  ON "invoice_lines" ("organization_id", "invoice_id");

ALTER TABLE "invoice_lines"
  ADD CONSTRAINT "invoice_lines_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE RESTRICT;

ALTER TABLE "invoice_lines"
  ADD CONSTRAINT "invoice_lines_organization_id_invoice_id_fkey"
  FOREIGN KEY ("organization_id", "invoice_id")
  REFERENCES "invoices" ("organization_id", "id") ON DELETE CASCADE;

ALTER TABLE "invoice_lines"
  ADD CONSTRAINT "invoice_lines_organization_id_product_id_fkey"
  FOREIGN KEY ("organization_id", "product_id")
  REFERENCES "products" ("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "invoice_lines" ENABLE ROW LEVEL SECURITY;
