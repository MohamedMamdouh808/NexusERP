-- Migration: payments.
--
-- Money received from a customer, recorded once and never changed afterwards.
-- Append-only is enforced by triggers and revoked privileges installed by
-- 20261115000008_payments_append_only. The status is never stored here - it is
-- derived from the presence of payment_reversals (RECORDED vs REVERSED).
--
-- The rules live in the database:
--   - the amount is strictly positive;
--   - the method is one of CASH, BANK_TRANSFER, CARD, OTHER;
--   - the number is PAY- followed by six digits, unique within the organization.
--
-- The payment date is checked against the future only by the application at
-- write time (UTC); the table has no clock, so a historical date is always a
-- valid value.
--
-- Every relation to another organization-owned table is a COMPOSITE foreign
-- key over (organization_id, id).
-- Row-level security is enabled with NO policies.

CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "number" VARCHAR(32) NOT NULL,
    "customer_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "payment_date" DATE NOT NULL,
    "method" VARCHAR(24) NOT NULL,
    "reference" VARCHAR(255),
    "recorded_by" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "payments_method_known" CHECK ("method" IN ('CASH', 'BANK_TRANSFER', 'CARD', 'OTHER'))
);

-- One number per organization.
CREATE UNIQUE INDEX "payments_organization_id_number_key"
  ON "payments" ("organization_id", "number");

-- The composite key payment_allocations / payment_reversals foreign keys are built on.
CREATE UNIQUE INDEX "payments_organization_id_id_key"
  ON "payments" ("organization_id", "id");

CREATE INDEX "payments_org_customer_date_idx"
  ON "payments" ("organization_id", "customer_id", "payment_date" DESC);

CREATE INDEX "payments_org_date_idx"
  ON "payments" ("organization_id", "payment_date");

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE RESTRICT;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_organization_id_customer_id_fkey"
  FOREIGN KEY ("organization_id", "customer_id")
  REFERENCES "contacts" ("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_recorded_by_fkey"
  FOREIGN KEY ("recorded_by") REFERENCES "users" ("id") ON DELETE RESTRICT;

ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
