-- Migration: invoices.
--
-- The operational invoice of a shipped sales order: no taxes, no tax-compliance
-- claim, and every invoice is labelled "Operational invoice - not a tax invoice"
-- in the API payload and the interface. A draft may be edited (due date only);
-- once issued the header is immutable except for the paid-status transitions and
-- void. The number is assigned at issue from the organization's shared sequence.
--
-- The rules live in the database:
--   - the status is one of the five API names;
--   - the total is never negative;
--   - a non-draft invoice always carries number, issue date and due date;
--   - the due date never precedes the issue date;
--   - the void fields appear together and only when the invoice is VOID;
--   - the number is unique within the organization once issued;
--   - one non-void invoice per order (VOID invoices never block re-invoicing).
--
-- Every relation to another organization-owned table is a COMPOSITE foreign
-- key over (organization_id, id), so an invoice can never point at a sales
-- order or a contact of another tenant - PostgreSQL refuses the row, not the
-- application.
--
-- Row-level security is enabled with NO policies, exactly as every other table
-- in this schema does.
--
-- The header-immutability trigger (including the allowed status-transition map)
-- is installed by 20261115000004_invoices_immutability, and the insert-only
-- rule for invoice_lines by the same migration.

CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "number" VARCHAR(32),
    "sales_order_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
    "issue_date" DATE,
    "due_date" DATE,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "void_reason" VARCHAR(1000),
    "voided_at" TIMESTAMPTZ(6),
    "voided_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoices_status_known" CHECK ("status" IN ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID')),
    CONSTRAINT "invoices_total_not_negative" CHECK ("total" >= 0),
    CONSTRAINT "invoices_issued_has_number_and_dates"
      CHECK ("status" NOT IN ('ISSUED', 'PARTIALLY_PAID', 'PAID')
             OR ("number" IS NOT NULL AND "issue_date" IS NOT NULL AND "due_date" IS NOT NULL)),
    CONSTRAINT "invoices_due_not_before_issue"
      CHECK ("due_date" IS NULL OR "issue_date" IS NULL OR "due_date" >= "issue_date"),
    CONSTRAINT "invoices_void_fields_together"
      CHECK (("void_reason" IS NULL) = ("voided_at" IS NULL)
             AND ("voided_at" IS NULL) = ("voided_by" IS NULL)),
    CONSTRAINT "invoices_void_fields_only_when_void"
      CHECK ("void_reason" IS NULL OR "status" = 'VOID')
);

-- One number per organization, only once issued.
CREATE UNIQUE INDEX "invoices_organization_id_number_key"
  ON "invoices" ("organization_id", "number") WHERE "number" IS NOT NULL;

-- The composite key the allocation table's foreign key is built on.
CREATE UNIQUE INDEX "invoices_organization_id_id_key"
  ON "invoices" ("organization_id", "id");

-- One non-void invoice per order: a VOID invoice never blocks re-invoicing.
CREATE UNIQUE INDEX "invoices_org_sales_order_non_void_key"
  ON "invoices" ("organization_id", "sales_order_id") WHERE "status" <> 'VOID';

-- The list is read by customer and date, by status and due date (overdue),
-- and by due date alone (overdue selection).
CREATE INDEX "invoices_org_customer_created_idx"
  ON "invoices" ("organization_id", "customer_id", "created_at" DESC);

CREATE INDEX "invoices_org_status_due_idx"
  ON "invoices" ("organization_id", "status", "due_date");

CREATE INDEX "invoices_org_due_idx"
  ON "invoices" ("organization_id", "due_date");

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE RESTRICT;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_organization_id_sales_order_id_fkey"
  FOREIGN KEY ("organization_id", "sales_order_id")
  REFERENCES "sales_orders" ("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_organization_id_customer_id_fkey"
  FOREIGN KEY ("organization_id", "customer_id")
  REFERENCES "contacts" ("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT;

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_voided_by_fkey"
  FOREIGN KEY ("voided_by") REFERENCES "users" ("id") ON DELETE RESTRICT;

ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
