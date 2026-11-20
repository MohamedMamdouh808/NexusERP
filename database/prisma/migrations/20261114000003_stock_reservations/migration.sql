-- Migration: stock reservations.
--
-- A hold placed on stock when a sales order is confirmed. ACTIVE while the order
-- is confirmed; CONSUMED when shipped; RELEASED when cancelled.
--
-- The rules live in the database:
--   - the quantity is greater than zero;
--   - the status is one of ACTIVE, CONSUMED or RELEASED.
--
-- Every relation is a COMPOSITE foreign key over (organization_id, id).
-- Row-level security is enabled with NO policies.

CREATE TABLE "stock_reservations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "sales_order_line_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "status" VARCHAR(24) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stock_reservations_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "stock_reservations_status_known" CHECK ("status" IN ('ACTIVE', 'CONSUMED', 'RELEASED'))
);

CREATE INDEX "stock_reservations_org_order_line_idx"
  ON "stock_reservations" ("organization_id", "sales_order_line_id");

CREATE INDEX "stock_reservations_org_warehouse_product_idx"
  ON "stock_reservations" ("organization_id", "warehouse_id", "product_id");

CREATE INDEX "stock_reservations_org_status_idx"
  ON "stock_reservations" ("organization_id", "status");

ALTER TABLE "stock_reservations"
  ADD CONSTRAINT "stock_reservations_organization_id_sales_order_line_id_fkey"
  FOREIGN KEY ("organization_id", "sales_order_line_id")
  REFERENCES "sales_order_lines" ("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "stock_reservations"
  ADD CONSTRAINT "stock_reservations_organization_id_warehouse_id_fkey"
  FOREIGN KEY ("organization_id", "warehouse_id")
  REFERENCES "warehouses" ("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "stock_reservations"
  ADD CONSTRAINT "stock_reservations_organization_id_product_id_fkey"
  FOREIGN KEY ("organization_id", "product_id")
  REFERENCES "products" ("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "stock_reservations" ENABLE ROW LEVEL SECURITY;
