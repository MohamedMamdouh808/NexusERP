-- Migration: the product catalogue and the organization's currency.
--
-- 1. The organization's currency: an ISO 4217 code of three uppercase letters,
--    never empty. Existing organizations get USD, and so do the ones created
--    afterwards. Changing it is not part of this feature.
-- 2. The catalogue tables: products, product_categories and units_of_measure,
--    each carrying organization_id with a composite (organization_id, id) key.
-- 3. The composite references: a product can only name a category and a unit of
--    its OWN organization.
-- 4. Case-insensitive uniqueness: the SKU within an organization (archived
--    products keep their SKU reserved), and the category and unit names.
-- 5. Row level security, enabled with no policies: deny by default, and the
--    application role is the only one that reaches these tables.
-- 6. The default units of measure for the organizations that already exist, so
--    that an organization with no products can still create its first one.
--
-- Every object is created in the schema the migration is applied to, so the
-- isolated test schema and the shared schema stay in parity. Every name is
-- snake_case, per the convention in database/README.md.

-- ---------------------------------------------------------------------------
-- 1. The organization's currency
-- ---------------------------------------------------------------------------
ALTER TABLE "organizations" ADD COLUMN "currency_code" VARCHAR(3) NOT NULL DEFAULT 'USD';

-- ---------------------------------------------------------------------------
-- 2. The catalogue tables
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3. Composite references to the category and the unit
-- ---------------------------------------------------------------------------
ALTER TABLE "products"
  ADD CONSTRAINT "products_organization_id_category_id_fkey"
  FOREIGN KEY ("organization_id", "category_id")
  REFERENCES "product_categories"("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "products"
  ADD CONSTRAINT "products_organization_id_unit_id_fkey"
  FOREIGN KEY ("organization_id", "unit_id")
  REFERENCES "units_of_measure"("organization_id", "id") ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- 4. Case-insensitive uniqueness
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "products_organization_id_lower_sku_key"
  ON "products" ("organization_id", LOWER("sku"));
CREATE UNIQUE INDEX "product_categories_organization_id_lower_name_key"
  ON "product_categories" ("organization_id", LOWER("name"));
CREATE UNIQUE INDEX "units_of_measure_organization_id_lower_name_key"
  ON "units_of_measure" ("organization_id", LOWER("name"));

-- ---------------------------------------------------------------------------
-- 5. Search and filter indexes
-- ---------------------------------------------------------------------------
CREATE INDEX "products_org_archived_idx" ON "products" ("organization_id", "is_archived");
CREATE INDEX "products_org_category_idx" ON "products" ("organization_id", "category_id");
CREATE INDEX "products_org_name_idx" ON "products" ("organization_id", "name");
CREATE INDEX "product_categories_org_name_idx" ON "product_categories" ("organization_id", "name");
CREATE INDEX "units_of_measure_org_name_idx" ON "units_of_measure" ("organization_id", "name");

-- ---------------------------------------------------------------------------
-- 6. Row level security, enabled with no policies
-- ---------------------------------------------------------------------------
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "units_of_measure" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 7. The service role's grants, in parity with the other tables
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA ' || quote_ident(current_schema()) || ' TO service_role';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 8. The default units of measure for the organizations that already exist.
--    A product cannot be created without a unit of measure, so an organization
--    that starts empty must still be able to create its first product.
-- ---------------------------------------------------------------------------
INSERT INTO "units_of_measure" ("id", "organization_id", "name", "abbreviation", "created_at")
SELECT gen_random_uuid(), o."id", v.name, v.abbreviation, now()
  FROM "organizations" o
  CROSS JOIN (VALUES ('unit', 'unit'), ('pair', 'pair'), ('roll', 'roll'), ('box', 'box'))
    AS v(name, abbreviation)
 WHERE NOT EXISTS (
        SELECT 1 FROM "units_of_measure" um
         WHERE um."organization_id" = o."id" AND LOWER(um."name") = LOWER(v.name));
