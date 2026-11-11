# Data Model: Products End to End

All table and column names are snake_case in the database; the Prisma models
carry the camelCase field names and state the database name with `@map`, per the
convention in `database/README.md`.

## Prisma models

```prisma
/// An item the organization sells or buys. Belongs to one organization.
/// The SKU is unique within the organization without regard to capitalisation
/// and stays reserved when the product is archived.
model Product {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  sku            String   @db.VarChar(64)
  name           String   @db.VarChar(255)
  categoryId     String   @map("category_id") @db.Uuid
  unitId         String   @map("unit_id") @db.Uuid
  purchasePrice  Decimal  @map("purchase_price") @db.Decimal(14, 4)
  sellingPrice   Decimal  @map("selling_price") @db.Decimal(14, 4)
  lowStockThreshold Decimal? @map("low_stock_threshold") @db.Decimal(14, 3)
  isArchived     Boolean  @default(false) @map("is_archived")
  version        Int      @default(1)
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  organization Organization       @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  category     ProductCategory   @relation(fields: [organizationId, categoryId], references: [organizationId, id], onDelete: Restrict)
  unit         UnitOfMeasure     @relation(fields: [organizationId, unitId], references: [organizationId, id], onDelete: Restrict)

  @@unique([organizationId, id], map: "products_organization_id_id_key")
  @@unique([organizationId, sku], map: "products_organization_id_sku_key")
  @@index([organizationId, isArchived], map: "products_org_archived_idx")
  @@index([organizationId, categoryId], map: "products_org_category_idx")
  @@index([organizationId, name], map: "products_org_name_idx")
  @@map("products")
}

/// A classification of products, unique within the organization without regard
/// to capitalisation.
model ProductCategory {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  name           String   @db.VarChar(128)
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  products     Product[]

  @@unique([organizationId, id], map: "product_categories_organization_id_id_key")
  @@unique([organizationId, lower(name)], map: "product_categories_organization_id_lower_name_key")
  @@map("product_categories")
}

/// A way of counting a product. Unique within the organization without regard to
/// capitalisation. Every organization starts with a default set.
model UnitOfMeasure {
  id             String   @id @default(uuid()) @db.Uuid
  organizationId String   @map("organization_id") @db.Uuid
  name           String   @db.VarChar(64)
  abbreviation   String   @db.VarChar(16)
  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  products     Product[]

  @@unique([organizationId, id], map: "units_of_measure_organization_id_id_key")
  @@unique([organizationId, lower(name)], map: "units_of_measure_organization_id_lower_name_key")
  @@map("units_of_measure")
}
```

### The organization gains its currency

```prisma
model Organization {
  // ...
  currencyCode String @default("USD") @map("currency_code") @db.VarChar(3)
}
```

`currency_code` holds an ISO 4217 code of exactly three uppercase letters. It
is never empty, it defaults to `USD` for the organizations that already exist
and for the ones created afterwards, and changing it is not part of this
feature.

## Migration `20261110000013_products_catalog_and_currency`

```sql
-- 1. The organization's currency (ISO 4217, three uppercase letters).
ALTER TABLE "organizations" ADD COLUMN "currency_code" VARCHAR(3) NOT NULL DEFAULT 'USD';

-- 2. The catalogue tables.
CREATE TABLE "units_of_measure" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(64) NOT NULL,
  "abbreviation" VARCHAR(16) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "units_of_measure_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "units_of_measure_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "units_of_measure_organization_id_id_key" UNIQUE ("organization_id", "id")
);

CREATE TABLE "product_categories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name" VARCHAR(128) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "product_categories_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "product_categories_organization_id_id_key" UNIQUE ("organization_id", "id")
);

CREATE TABLE "products" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "sku" VARCHAR(64) NOT NULL,
  "name" VARCHAR(255) NOT NULL,
  "category_id" UUID NOT NULL,
  "unit_id" UUID NOT NULL,
  "purchase_price" NUMERIC(14,4) NOT NULL,
  "selling_price" NUMERIC(14,4) NOT NULL,
  "low_stock_threshold" NUMERIC(14,3),
  "is_archived" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "products_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT,
  CONSTRAINT "products_organization_id_id_key" UNIQUE ("organization_id", "id"),
  CONSTRAINT "products_purchase_price_non_negative" CHECK ("purchase_price" >= 0),
  CONSTRAINT "products_selling_price_non_negative" CHECK ("selling_price" >= 0),
  CONSTRAINT "products_low_stock_threshold_non_negative"
    CHECK ("low_stock_threshold" IS NULL OR "low_stock_threshold" >= 0)
);

-- Composite references: a product can only name a category and a unit of its
-- own organization.
ALTER TABLE "products"
  ADD CONSTRAINT "products_organization_id_category_id_fkey"
  FOREIGN KEY ("organization_id", "category_id")
  REFERENCES "product_categories"("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "products"
  ADD CONSTRAINT "products_organization_id_unit_id_fkey"
  FOREIGN KEY ("organization_id", "unit_id")
  REFERENCES "units_of_measure"("organization_id", "id") ON DELETE RESTRICT;

-- 3. Case-insensitive uniqueness. The SKU index covers archived products too,
--    so an archived product keeps its SKU reserved.
CREATE UNIQUE INDEX "products_organization_id_lower_sku_key"
  ON "products" ("organization_id", LOWER("sku"));
CREATE UNIQUE INDEX "product_categories_organization_id_lower_name_key"
  ON "product_categories" ("organization_id", LOWER("name"));
CREATE UNIQUE INDEX "units_of_measure_organization_id_lower_name_key"
  ON "units_of_measure" ("organization_id", LOWER("name"));

-- 4. Search and filter indexes.
CREATE INDEX "products_org_archived_idx" ON "products" ("organization_id", "is_archived");
CREATE INDEX "products_org_category_idx" ON "products" ("organization_id", "category_id");
CREATE INDEX "products_org_name_idx" ON "products" ("organization_id", "name");

-- 5. Row level security, enabled with no policies: deny by default, and the
--    application role is the only one that reaches these tables.
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "units_of_measure" ENABLE ROW LEVEL SECURITY;

-- 6. The service role's grants, in parity with the other tables.
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public TO service_role;

-- 7. The default units of measure for the organizations that already exist.
INSERT INTO "units_of_measure" ("id", "organization_id", "name", "abbreviation", "created_at")
SELECT gen_random_uuid(), o."id", v.name, v.abbreviation, now()
  FROM "organizations" o
  CROSS JOIN (VALUES ('unit','unit'), ('pair','pair'), ('roll','roll'), ('box','box')) AS v(name, abbreviation)
 WHERE NOT EXISTS (
        SELECT 1 FROM "units_of_measure" um
         WHERE um."organization_id" = o."id" AND LOWER(um."name") = LOWER(v.name));
```

The migration is schema-neutral: it creates objects in the schema it is
applied to, so the isolated test schema and the shared schema stay in parity.

## Validation rules

| Field | Rule |
|---|---|
| `sku` | Required, trimmed, at most 64 characters, unique per organization without regard to capitalisation |
| `name` | Required, trimmed, at most 255 characters; may repeat |
| `category_id` | Required, must name a category of the same organization |
| `unit_id` | Required, must name a unit of the same organization |
| `purchase_price` | Required, a decimal with at most four places, not negative |
| `selling_price` | Required, a decimal with at most four places, not negative |
| `low_stock_threshold` | Optional, a decimal with at most three places, not negative |
| `organization_id` | Required, never changed |
| `version` | Starts at 1, increases on every accepted change, never chosen by the caller |
| `is_archived` | Starts false; only the archive and restore endpoints change it |
| category `name` | Required, trimmed, at most 128 characters, unique per organization without regard to capitalisation |
| unit `name`, `abbreviation` | Required, trimmed, at most 64 and 16 characters, unique per organization without regard to capitalisation |

On the wire, prices and the reorder level are decimal **strings**
(`"9.9900"`). A number in the body is refused.

## State transitions

```
   ( NEW )
      │  create
      ▼
   ( ACTIVE ) ────── archive ──────▶ ( ARCHIVED )
      ▲                                    │
      └──────────── restore ──────────────┘
```

- A product is created active, at version 1.
- Archiving is refused when the usage check reports the product in use; the
  product stays active.
- An archived product keeps its SKU reserved and stays readable by its
  identifier.
- Nothing is ever deleted: there is no delete endpoint and no delete path in
  the service.

## Audit structure

Every change writes one audit entry in the same transaction as the change:

| Action | Record type | Before | After |
|---|---|---|---|
| `products.created` | `product` | empty | the created values |
| `products.updated` | `product` | the values before the change | the values after it |
| `products.archived` | `product` | `isArchived: false` | `isArchived: true` |
| `products.restored` | `product` | `isArchived: true` | `isArchived: false` |
| `product_categories.created` | `product_category` | empty | the created values |
| `units_of_measure.created` | `unit_of_measure` | empty | the created values |

The audit entries carry the organization and the acting user, and the log is
append-only at the database level.
