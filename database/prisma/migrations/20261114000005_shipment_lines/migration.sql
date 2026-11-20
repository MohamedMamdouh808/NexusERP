-- Migration: shipment lines.
--
-- The quantity of one sales-order line shipped in one shipment. Append-only,
-- like the shipment itself. Carries the quantity reserved for its order line.
--
-- The rules live in the database:
--   - the quantity is greater than zero;
--   - one entry per order line per shipment.
--
-- Every relation is a COMPOSITE foreign key over (organization_id, id).
-- Row-level security is enabled with NO policies.

CREATE TABLE "shipment_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "sales_order_line_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shipment_lines_quantity_positive" CHECK ("quantity" > 0)
);

-- One entry per order line per shipment.
CREATE UNIQUE INDEX "shipment_lines_org_shipment_line_key"
  ON "shipment_lines" ("organization_id", "shipment_id", "sales_order_line_id");

-- The composite key.
CREATE UNIQUE INDEX "shipment_lines_organization_id_id_key"
  ON "shipment_lines" ("organization_id", "id");

CREATE INDEX "shipment_lines_org_shipment_idx"
  ON "shipment_lines" ("organization_id", "shipment_id");

CREATE INDEX "shipment_lines_org_order_line_idx"
  ON "shipment_lines" ("organization_id", "sales_order_line_id");

ALTER TABLE "shipment_lines"
  ADD CONSTRAINT "shipment_lines_organization_id_shipment_id_fkey"
  FOREIGN KEY ("organization_id", "shipment_id")
  REFERENCES "shipments" ("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "shipment_lines"
  ADD CONSTRAINT "shipment_lines_organization_id_sales_order_line_id_fkey"
  FOREIGN KEY ("organization_id", "sales_order_line_id")
  REFERENCES "sales_order_lines" ("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "shipment_lines"
  ADD CONSTRAINT "shipment_lines_organization_id_product_id_fkey"
  FOREIGN KEY ("organization_id", "product_id")
  REFERENCES "products" ("organization_id", "id") ON DELETE RESTRICT;

ALTER TABLE "shipment_lines" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Append-only protection: no UPDATE or DELETE
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  target_schema text := current_schema();
BEGIN
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.shipment_lines_reject_update()
       RETURNS trigger
       LANGUAGE plpgsql
       SET search_path = %L
       AS %L',
    target_schema,
    '',
    $fn$
      BEGIN
        RAISE EXCEPTION 'shipment_lines is append-only: UPDATE is not permitted';
      END;
    $fn$
  );
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.shipment_lines_reject_delete()
       RETURNS trigger
       LANGUAGE plpgsql
       SET search_path = %L
       AS %L',
    target_schema,
    '',
    $fn$
      BEGIN
        RAISE EXCEPTION 'shipment_lines is append-only: DELETE is not permitted';
      END;
    $fn$
  );
  EXECUTE format('DROP TRIGGER IF EXISTS shipment_lines_reject_update ON %I.shipment_lines', target_schema);
  EXECUTE format(
    'CREATE TRIGGER shipment_lines_reject_update
       BEFORE UPDATE ON %I.shipment_lines
       FOR EACH ROW
       EXECUTE FUNCTION %I.shipment_lines_reject_update()',
    target_schema,
    target_schema,
    target_schema
  );
  EXECUTE format('DROP TRIGGER IF EXISTS shipment_lines_reject_delete ON %I.shipment_lines', target_schema);
  EXECUTE format(
    'CREATE TRIGGER shipment_lines_reject_delete
       BEFORE DELETE ON %I.shipment_lines
       FOR EACH ROW
       EXECUTE FUNCTION %I.shipment_lines_reject_delete()',
    target_schema,
    target_schema,
    target_schema
  );
END $$;

-- Statement-level protection: no TRUNCATE
REVOKE TRUNCATE ON TABLE "shipment_lines" FROM PUBLIC;
