-- Migration: the lines of a purchase order.
--
-- One row per product on an order. One product appears at most once per order,
-- the received quantity never exceeds the ordered quantity, and the line total
-- is the rounded quantity times the unit cost - the same rule the service
-- applies, stated here a second time as a line of defence.
--
-- The unit of measure is a SNAPSHOT of the abbreviation captured when the line
-- was entered. It is not a foreign key, because a later edit of the product's
-- unit must never rewrite the document or its receipt history.
--
-- The line is deleted with its order (cascade), which is only possible while
-- the order is a draft and has no receipts.
--
-- Row-level security is enabled with NO policies.
--
-- Schema-neutral: created in the schema the migration is applied to. Every name
-- is snake_case, per the convention in database/README.md.

CREATE TABLE "purchase_order_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity_ordered" DECIMAL(14,3) NOT NULL,
    "quantity_received" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(14,4) NOT NULL,
    "unit_of_measure" VARCHAR(16) NOT NULL,
    "line_total" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_order_lines_quantity_ordered_positive" CHECK ("quantity_ordered" > 0),
    CONSTRAINT "purchase_order_lines_received_within_ordered" CHECK ("quantity_received" >= 0 AND "quantity_received" <= "quantity_ordered"),
    CONSTRAINT "purchase_order_lines_unit_cost_not_negative" CHECK ("unit_cost" >= 0),
    CONSTRAINT "purchase_order_lines_unit_of_measure_present" CHECK (length(trim("unit_of_measure")) > 0),
    -- PostgreSQL's round() on a numeric rounds half away from zero, which is
    -- half-up for the non-negative values this table permits.
    CONSTRAINT "purchase_order_lines_line_total_matches" CHECK ("line_total" >= 0 AND "line_total" = round("quantity_ordered" * "unit_cost", 2))
);

-- One line per product per order.
CREATE UNIQUE INDEX "purchase_order_lines_org_order_product_key"
  ON "purchase_order_lines" ("organization_id", "purchase_order_id", "product_id");

-- The composite key the receipt line's foreign key is built on.
CREATE UNIQUE INDEX "purchase_order_lines_organization_id_id_key"
  ON "purchase_order_lines" ("organization_id", "id");

CREATE INDEX "purchase_order_lines_org_order_idx"
  ON "purchase_order_lines" ("organization_id", "purchase_order_id");

ALTER TABLE "purchase_order_lines"
  ADD CONSTRAINT "purchase_order_lines_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The composite foreign keys keep the line inside one organization and inside
-- one order of that organization.
ALTER TABLE "purchase_order_lines"
  ADD CONSTRAINT "purchase_order_lines_organization_id_purchase_order_id_fkey"
  FOREIGN KEY ("organization_id", "purchase_order_id") REFERENCES "purchase_orders"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "purchase_order_lines"
  ADD CONSTRAINT "purchase_order_lines_organization_id_product_id_fkey"
  FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-level security with no policies.
ALTER TABLE "purchase_order_lines" ENABLE ROW LEVEL SECURITY;
