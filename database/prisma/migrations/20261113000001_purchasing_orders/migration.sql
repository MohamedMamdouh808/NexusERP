-- Migration: purchase orders.
--
-- The organization's commitment to buy from a supplier. A draft may be edited;
-- a confirmed order may not, and the received quantities live on the LINES
-- rather than here, so the status and the quantities can never disagree.
--
-- The rules live in the database:
--   - the status is one of the five API names;
--   - the expected date is never before the order date;
--   - the total is never negative;
--   - the number is unique within the organization.
--
-- Every relation to another organization-owned table is a COMPOSITE foreign
-- key over (organization_id, id), so an order can never point at a supplier or
-- a warehouse of another tenant - PostgreSQL refuses the row, not the
-- application.
--
-- Row-level security is enabled with NO policies, exactly as every other table
-- in this schema does.
--
-- Schema-neutral: created in the schema the migration is applied to, so the
-- isolated test schema and the shared schema stay in parity. Every name is
-- snake_case, per the convention in database/README.md.

CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "number" VARCHAR(32) NOT NULL,
    "supplier_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
    "order_date" DATE NOT NULL,
    "expected_date" DATE,
    "notes" VARCHAR(1000) NOT NULL DEFAULT '',
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_orders_status_known" CHECK ("status" IN ('DRAFT', 'CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')),
    CONSTRAINT "purchase_orders_expected_date_after_order_date" CHECK ("expected_date" IS NULL OR "expected_date" >= "order_date"),
    CONSTRAINT "purchase_orders_total_not_negative" CHECK ("total" >= 0)
);

-- One number per organization.
CREATE UNIQUE INDEX "purchase_orders_organization_id_number_key"
  ON "purchase_orders" ("organization_id", "number");

-- The composite key the line table's foreign key is built on.
CREATE UNIQUE INDEX "purchase_orders_organization_id_id_key"
  ON "purchase_orders" ("organization_id", "id");

-- The list is read by status and date, and by the references the usage guards ask about.
CREATE INDEX "purchase_orders_org_status_date_idx"
  ON "purchase_orders" ("organization_id", "status", "order_date");

CREATE INDEX "purchase_orders_org_supplier_idx"
  ON "purchase_orders" ("organization_id", "supplier_id");

CREATE INDEX "purchase_orders_org_warehouse_idx"
  ON "purchase_orders" ("organization_id", "warehouse_id");

ALTER TABLE "purchase_orders"
  ADD CONSTRAINT "purchase_orders_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The composite foreign keys are what keep an order inside one organization.
ALTER TABLE "purchase_orders"
  ADD CONSTRAINT "purchase_orders_organization_id_supplier_id_fkey"
  FOREIGN KEY ("organization_id", "supplier_id") REFERENCES "contacts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_orders"
  ADD CONSTRAINT "purchase_orders_organization_id_warehouse_id_fkey"
  FOREIGN KEY ("organization_id", "warehouse_id") REFERENCES "warehouses"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The author of the order. The order survives the deletion of the account:
-- the record of what was bought outlives the person who bought it.
ALTER TABLE "purchase_orders"
  ADD CONSTRAINT "purchase_orders_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-level security with no policies: the table is invisible to every role
-- that is not the table owner.
ALTER TABLE "purchase_orders" ENABLE ROW LEVEL SECURITY;
