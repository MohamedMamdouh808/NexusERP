-- Migration 010: Create contacts table with tenant isolation, RLS, composite unique keys, and case-insensitive unique email index
--
-- Conforms to:
-- - Constitution Principle I (Tenant isolation via composite keys: (organization_id, id), (organization_id, code))
-- - PRD P0-F004 Section 7.4 and Section 9.3/9.7
-- - RLS enabled with no policies (deny-all default)
-- - service_role full privileges granted

CREATE TABLE "contacts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "code" VARCHAR(32) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "email" VARCHAR(255),
  "phone" VARCHAR(64),
  "is_customer" BOOLEAN NOT NULL DEFAULT false,
  "is_supplier" BOOLEAN NOT NULL DEFAULT false,
  "address_line1" VARCHAR(255),
  "address_line2" VARCHAR(255),
  "city" VARCHAR(100),
  "region" VARCHAR(100),
  "postal_code" VARCHAR(32),
  "country" VARCHAR(100),
  "is_archived" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "contacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "contacts_organization_id_id_key" UNIQUE ("organization_id", "id"),
  CONSTRAINT "contacts_organization_id_code_key" UNIQUE ("organization_id", "code"),
  CONSTRAINT "contacts_at_least_one_role" CHECK ("is_customer" = true OR "is_supplier" = true)
);

-- Case-insensitive unique email per organization (only for non-empty email addresses)
CREATE UNIQUE INDEX "contacts_organization_id_lower_email_idx"
  ON "contacts" ("organization_id", LOWER("email"))
  WHERE "email" IS NOT NULL AND "email" <> '';

-- Search and filtering indexes
CREATE INDEX "contacts_org_archived_idx" ON "contacts" ("organization_id", "is_archived");
CREATE INDEX "contacts_org_customer_idx" ON "contacts" ("organization_id", "is_customer");
CREATE INDEX "contacts_org_supplier_idx" ON "contacts" ("organization_id", "is_supplier");

-- Enable Row Level Security (schema-neutral)
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;

-- Grant permissions to service_role (parity with all tables)
GRANT SELECT, INSERT, UPDATE, DELETE ON "contacts" TO service_role;
