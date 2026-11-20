-- Migration: payment_reversals.
--
-- The compensating record that voids a payment's effect. Append-only with
-- payments and payment_allocations (triggers and revoked privileges in
-- 20261115000008_payments_append_only). The payment row itself is never
-- changed; the presence of a reversal row is the only sign that the payment no
-- longer counts towards balances.
--
-- The rules live in the database:
--   - the reason is non-empty;
--   - one reversal per payment.
--
-- Every relation is a COMPOSITE foreign key over (organization_id, id).
-- Row-level security is enabled with NO policies.

CREATE TABLE "payment_reversals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "reversed_by" UUID NOT NULL,
    "reversed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_reversals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_reversals_reason_non_empty" CHECK (btrim("reason") <> '')
);

CREATE UNIQUE INDEX "payment_reversals_org_payment_key"
  ON "payment_reversals" ("organization_id", "payment_id");

CREATE INDEX "payment_reversals_org_payment_idx"
  ON "payment_reversals" ("organization_id", "payment_id");

ALTER TABLE "payment_reversals"
  ADD CONSTRAINT "payment_reversals_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations" ("id") ON DELETE RESTRICT;

ALTER TABLE "payment_reversals"
  ADD CONSTRAINT "payment_reversals_organization_id_payment_id_fkey"
  FOREIGN KEY ("organization_id", "payment_id")
  REFERENCES "payments" ("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "payment_reversals"
  ADD CONSTRAINT "payment_reversals_reversed_by_fkey"
  FOREIGN KEY ("reversed_by") REFERENCES "users" ("id") ON DELETE RESTRICT;

ALTER TABLE "payment_reversals" ENABLE ROW LEVEL SECURITY;
