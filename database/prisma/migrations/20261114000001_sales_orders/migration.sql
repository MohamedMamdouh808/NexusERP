-- Migration: sales orders.
--
-- The organization's commitment to sell to a customer. A draft may be edited;
-- a confirmed order may not, and confirmation reserves stock for every line or
-- for none. The line quantities live on the lines, never here, so the status
-- and the quantities can never disagree.
--
-- The rules live in the database:
--   - the status is one of the four API names;
--   - the total is never negative;
--   - the number is unique within the organization.
--
-- Every relation to another organization-owned table is a COMPOSITE foreign
-- key over (organization_id, id), so an order can never point at a customer or
-- a warehouse of another tenant - PostgreSQL refuses the row, not the
-- application.
--
-- Row-level security is enabled with NO policies, exactly as every other table
-- in this schema does.
--
-- Schema-neutral: created in the schema the migration is applied to, so the
-- isolated test schema and the shared schema stay in parity. Every name is
-- snake_case, per the convention in database/README.md.

CREATE TABLE "sales_orders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "number" VARCHAR(32) NOT NULL,
    "customer_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
    "order_date" DATE NOT NULL,
    "notes" VARCHAR(1000) NOT NULL DEFAULT '',
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "sales_orders_status_known" CHECK ("status" IN ('DRAFT', 'CONFIRMED', 'SHIPPED', 'CANCELLED')),
    CONSTRAINT "sales_orders_total_not_negative" CHECK ("total" >= 0)
);

-- One number per organization.
CREATE UNIQUE INDEX "sales_orders_organization_id_number_key"
  ON "sales_orders" ("organization_id", "number");

-- The composite key the line table's foreign key is built on.
CREATE UNIQUE INDEX "sales_orders_organization_id_id_key"
  ON "sales_orders" ("organization_id", "id");

-- The list is read by status and date, and by the references the usage guards ask about.
CREATE INDEX "sales_orders_org_status_date_idx"
  ON "sales_orders" ("organization_id", "status", "order_date");

CREATE INDEX "sales_orders_org_customer_idx"
  ON "sales_orders" ("organization_id", "customer_id");

CREATE INDEX "sales_orders_org_warehouse_idx"
  ON "sales_orders" ("organization_id", "warehouse_id");

-- Row-level security with no policies: tenant scope is enforced by the session,
-- never by a client-supplied identifier.
ALTER TABLE "sales_orders" ENABLE ROW LEVEL SECURITY;
