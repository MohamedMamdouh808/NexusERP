-- Migration: sales order lines.
--
-- One product on a sales order. One product appears at most once per order.
-- The unit price defaults to the product's selling price when the line is
-- entered and remains editable.
--
-- The rules live in the database:
--   - the quantity is greater than zero;
--   - the unit price is never negative;
--   - the line total is never negative;
--   - one product per order.
--
-- Every relation is a COMPOSITE foreign key over (organization_id, id).
-- Row-level security is enabled with NO policies.

CREATE TABLE "sales_order_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "sales_order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_price" DECIMAL(14,4) NOT NULL,
    "line_total" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_order_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sales_order_lines_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "sales_order_lines_unit_price_not_negative" CHECK ("unit_price" >= 0),
    CONSTRAINT "sales_order_lines_line_total_not_negative" CHECK ("line_total" >= 0)
);

-- One product per order.
CREATE UNIQUE INDEX "sales_order_lines_org_order_product_key"
  ON "sales_order_lines" ("organization_id", "sales_order_id", "product_id");

-- The composite key the shipment-line table's foreign key is built on.
CREATE UNIQUE INDEX "sales_order_lines_organization_id_id_key"
  ON "sales_order_lines" ("organization_id", "id");

CREATE INDEX "sales_order_lines_org_order_idx"
  ON "sales_order_lines" ("organization_id", "sales_order_id");

-- Foreign keys keep every relation inside a single organization.
ALTER TABLE "sales_order_lines"
  ADD CONSTRAINT "sales_order_lines_organization_id_sales_order_id_fkey"
  FOREIGN KEY ("organization_id", "sales_order_id")
  REFERENCES "sales_orders" ("organization_id", "id") ON DELETE CASCADE;

ALTER TABLE "sales_order_lines"
  ADD CONSTRAINT "sales_order_lines_organization_id_product_id_fkey"
  FOREIGN KEY ("organization_id", "product_id")
  REFERENCES "products" ("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "sales_order_lines" ENABLE ROW LEVEL SECURITY;
