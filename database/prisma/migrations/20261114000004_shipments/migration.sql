-- Migration: shipments.
--
-- A permanent record that a confirmed sales order went out. Append-only: the
-- database rejects UPDATE, DELETE and TRUNCATE. The customer and the warehouse
-- are read from the order and are not duplicated here. In v1 one shipment ships
-- the whole order.
--
-- The rules live in the database:
--   - the number is unique within the organization.
--
-- Every relation is a COMPOSITE foreign key over (organization_id, id).
-- Row-level security is enabled with NO policies.

CREATE TABLE "shipments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "number" VARCHAR(32) NOT NULL,
    "sales_order_id" UUID NOT NULL,
    "shipped_by" UUID NOT NULL,
    "shipped_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- One number per organization.
CREATE UNIQUE INDEX "shipments_organization_id_number_key"
  ON "shipments" ("organization_id", "number");

-- The composite key the shipment-line table's foreign key is built on.
CREATE UNIQUE INDEX "shipments_organization_id_id_key"
  ON "shipments" ("organization_id", "id");

CREATE INDEX "shipments_org_shipped_idx"
  ON "shipments" ("organization_id", "shipped_at");

CREATE INDEX "shipments_org_order_idx"
  ON "shipments" ("organization_id", "sales_order_id");

ALTER TABLE "shipments"
  ADD CONSTRAINT "shipments_organization_id_sales_order_id_fkey"
  FOREIGN KEY ("organization_id", "sales_order_id")
  REFERENCES "sales_orders" ("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "shipments" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Append-only protection: no UPDATE or DELETE
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  target_schema text := current_schema();
BEGIN
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.shipments_reject_update()
       RETURNS trigger
       LANGUAGE plpgsql
       SET search_path = %L
       AS %L',
    target_schema,
    '',
    $fn$
      BEGIN
        RAISE EXCEPTION 'shipments is append-only: UPDATE is not permitted';
      END;
    $fn$
  );
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.shipments_reject_delete()
       RETURNS trigger
       LANGUAGE plpgsql
       SET search_path = %L
       AS %L',
    target_schema,
    '',
    $fn$
      BEGIN
        RAISE EXCEPTION 'shipments is append-only: DELETE is not permitted';
      END;
    $fn$
  );
  EXECUTE format('DROP TRIGGER IF EXISTS shipments_reject_update ON %I.shipments', target_schema);
  EXECUTE format(
    'CREATE TRIGGER shipments_reject_update
       BEFORE UPDATE ON %I.shipments
       FOR EACH ROW
       EXECUTE FUNCTION %I.shipments_reject_update()',
    target_schema,
    target_schema,
    target_schema
  );
  EXECUTE format('DROP TRIGGER IF EXISTS shipments_reject_delete ON %I.shipments', target_schema);
  EXECUTE format(
    'CREATE TRIGGER shipments_reject_delete
       BEFORE DELETE ON %I.shipments
       FOR EACH ROW
       EXECUTE FUNCTION %I.shipments_reject_delete()',
    target_schema,
    target_schema,
    target_schema
  );
END $$;

-- Statement-level protection: no TRUNCATE
REVOKE TRUNCATE ON TABLE "shipments" FROM PUBLIC;
