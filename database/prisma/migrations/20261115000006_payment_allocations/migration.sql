-- Migration: payment_allocations.
--
-- The share of one payment applied to one invoice. Append-only with payments
-- and payment_reversals: BEFORE UPDATE/DELETE triggers raise and TRUNCATE is
-- revoked, all in 20261115000008_payments_append_only. The allocation rows stay
-- visible after a reversal and are simply not counted by invoice_balances.
--
-- The rules live in the database:
--   - the amount is strictly positive;
--   - one allocation per invoice per payment.
--
-- Every relation is a COMPOSITE foreign key over (organization_id, id), so an
-- allocation can never point at a payment or an invoice of another tenant.
-- Row-level security is enabled with NO policies.

CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_allocations_amount_positive" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "payment_allocations_org_payment_invoice_key"
  ON "payment_allocations" ("organization_id", "payment_id", "invoice_id");

-- The balance recompute locks the invoice and reads through this index.
CREATE INDEX "payment_allocations_org_invoice_idx"
  ON "payment_allocations" ("organization_id", "invoice_id");

CREATE INDEX "payment_allocations_org_payment_idx"
  ON "payment_allocations" ("organization_id", "payment_id");

ALTER TABLE "payment_allocations"
  ADD CONSTRAINT "payment_allocations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE RESTRICT;

ALTER TABLE "payment_allocations"
  ADD CONSTRAINT "payment_allocations_organization_id_payment_id_fkey"
  FOREIGN KEY ("organization_id", "payment_id")
  REFERENCES "payments" ("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "payment_allocations"
  ADD CONSTRAINT "payment_allocations_organization_id_invoice_id_fkey"
  FOREIGN KEY ("organization_id", "invoice_id")
  REFERENCES "invoices" ("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "payment_allocations" ENABLE ROW LEVEL SECURITY;
