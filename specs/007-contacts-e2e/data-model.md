# Data Model: Contacts End to End

## Prisma Schema Definition

```prisma
model Contact {
  id             String       @id @default(uuid()) @db.Uuid
  organizationId String       @map("organization_id") @db.Uuid
  code           String       @db.VarChar(32)
  name           String       @db.VarChar(255)
  email          String?      @db.VarChar(255)
  phone          String?      @db.VarChar(64)
  isCustomer     Boolean      @default(false) @map("is_customer")
  isSupplier     Boolean      @default(false) @map("is_supplier")
  addressLine1   String?      @map("address_line1") @db.VarChar(255)
  addressLine2   String?      @map("address_line2") @db.VarChar(255)
  city           String?      @db.VarChar(100)
  region         String?      @db.VarChar(100)
  postalCode     String?      @map("postal_code") @db.VarChar(32)
  country        String?      @db.VarChar(100)
  isArchived     Boolean      @default(false) @map("is_archived")
  version        Int          @default(1)
  createdAt      DateTime     @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime     @updatedAt @map("updated_at") @db.Timestamptz(6)

  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)

  @@unique([organizationId, id], map: "contacts_organization_id_id_key")
  @@unique([organizationId, code], map: "contacts_organization_id_code_key")
  @@index([organizationId, isArchived], map: "contacts_org_archived_idx")
  @@index([organizationId, isCustomer], map: "contacts_org_customer_idx")
  @@index([organizationId, isSupplier], map: "contacts_org_supplier_idx")
  @@map("contacts")
}
```

## SQL Migration Details (`20261110000010_create_contacts_table/migration.sql`)

```sql
-- 1. Create contacts table
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

-- 2. Case-insensitive unique email index per organization (only for non-empty emails)
CREATE UNIQUE INDEX "contacts_organization_id_lower_email_idx"
  ON "contacts" ("organization_id", LOWER("email"))
  WHERE "email" IS NOT NULL AND "email" <> '';

-- 3. Search and filter indexes
CREATE INDEX "contacts_org_archived_idx" ON "contacts" ("organization_id", "is_archived");
CREATE INDEX "contacts_org_customer_idx" ON "contacts" ("organization_id", "is_customer");
CREATE INDEX "contacts_org_supplier_idx" ON "contacts" ("organization_id", "is_supplier");

-- 4. Enable Row Level Security (RLS) with no policies
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;

-- 5. Grant permissions to service_role and postgres roles
GRANT SELECT, INSERT, UPDATE, DELETE ON "contacts" TO service_role;
```

## State Transitions

```
[ New Contact Creation ]
        │
        ▼
   ( ACTIVE )
        │  ▲
archive │  │ restore
        ▼  │
  ( ARCHIVED )
```
- A contact is created with `is_archived: false`.
- Archiving sets `is_archived: true` if no active documents reference it.
- Restoring sets `is_archived: false`.
- Hard DELETE is disabled; records are permanently retained for audit/ledger integrity.
