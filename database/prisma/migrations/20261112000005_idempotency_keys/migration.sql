-- Migration: the idempotency records.
--
-- One row per posting attempt that carried an idempotency key, scoped by the
-- organization, the endpoint and the key itself. The record holds the
-- fingerprint of the request and the response that was given the first time,
-- so a retry can be answered with exactly that response and create nothing.
--
-- The record is written in the SAME transaction as the business change: a
-- rolled-back attempt leaves no claim, so the key can be used again for a
-- corrected request.
--
-- Records expire 24 hours after they are created; the purge script removes
-- them afterwards. An expired record is treated as absent.
--
-- Row-level security is enabled with NO policies, exactly as every other table
-- in this schema does.
--
-- Schema-neutral: created in the schema the migration is applied to, so the
-- isolated test schema and the shared schema stay in parity. Every name is
-- snake_case, per the convention in database/README.md.

CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "endpoint" VARCHAR(128) NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "response_status" INTEGER,
    "response_body" JSONB,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- The claim: one record per organization, endpoint and key. The unique index
-- is also what serializes two simultaneous requests with the same key.
CREATE UNIQUE INDEX "idempotency_keys_org_endpoint_key"
  ON "idempotency_keys" ("organization_id", "endpoint", "key");

-- The purge reads the expired records by their expiry.
CREATE INDEX "idempotency_keys_expires_idx"
  ON "idempotency_keys" ("expires_at");

ALTER TABLE "idempotency_keys"
  ADD CONSTRAINT "idempotency_keys_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security with no policies: the table is invisible to every role
-- that is not the table owner.
ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;
