-- Migration: the stock balances table.
--
-- One row per organization, warehouse and product, holding the two quantities
-- the product owns: on hand and reserved. Available is on_hand minus reserved
-- and is NEVER stored - it is derived when it is read, so it cannot drift.
--
-- A MISSING row means zero on hand and zero reserved. The row is created by the
-- first movement for that combination, which is why the table is created empty
-- and the balances are written by the movement path, not by a bulk seed.
--
-- The rules live in the database:
--   - on_hand is never negative;
--   - reserved is never negative;
--   - reserved never exceeds on_hand.
--
-- Row-level security is enabled with NO policies, exactly as every other table
-- in this schema does: the application connects as the owner (and bypasses
-- RLS), while the API roles see nothing at all.
--
-- Schema-neutral: created in the schema the migration is applied to, so the
-- isolated test schema and the shared schema stay in parity. Every name is
-- snake_case, per the convention in database/README.md.

CREATE TABLE "stock_balances" (
    "organization_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "on_hand" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_balances_pkey" PRIMARY KEY ("organization_id", "warehouse_id", "product_id"),
    CONSTRAINT "stock_balances_on_hand_not_negative" CHECK ("on_hand" >= 0),
    CONSTRAINT "stock_balances_reserved_not_negative" CHECK ("reserved" >= 0),
    CONSTRAINT "stock_balances_reserved_within_on_hand" CHECK ("reserved" <= "on_hand")
);

-- One balance per organization, warehouse and product.
CREATE UNIQUE INDEX "stock_balances_org_warehouse_product_key"
  ON "stock_balances" ("organization_id", "warehouse_id", "product_id");

-- The product listing and the low-stock aggregation read by product.
CREATE INDEX "stock_balances_org_product_idx"
  ON "stock_balances" ("organization_id", "product_id");

-- The warehouse listing and the movement write path read by warehouse.
CREATE INDEX "stock_balances_org_warehouse_idx"
  ON "stock_balances" ("organization_id", "warehouse_id");

ALTER TABLE "stock_balances"
  ADD CONSTRAINT "stock_balances_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The composite foreign keys are what keep a balance inside one organization:
-- a balance can never point at a warehouse or a product of another tenant.
ALTER TABLE "stock_balances"
  ADD CONSTRAINT "stock_balances_organization_id_warehouse_id_fkey"
  FOREIGN KEY ("organization_id", "warehouse_id") REFERENCES "warehouses"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_balances"
  ADD CONSTRAINT "stock_balances_organization_id_product_id_fkey"
  FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-level security with no policies: the table is invisible to every role
-- that is not the table owner.
ALTER TABLE "stock_balances" ENABLE ROW LEVEL SECURITY;
