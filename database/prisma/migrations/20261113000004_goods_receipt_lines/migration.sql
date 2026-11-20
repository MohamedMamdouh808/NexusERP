-- Migration: the lines of a goods receipt.
--
-- The quantity of one purchase-order line received in one receipt. The unit
-- cost and the unit of measure are COPIED from the order line, so the receipt
-- history stays reproducible even when the product's price or unit changes
-- later.
--
-- The receipt lines are append-only, exactly like the receipt itself: the
-- database rejects UPDATE, DELETE and TRUNCATE.
--
-- Row-level security is enabled with NO policies.
--
-- Schema-neutral: created in the schema the migration is applied to. Every name
-- is snake_case, per the convention in database/README.md.

CREATE TABLE "goods_receipt_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "goods_receipt_id" UUID NOT NULL,
    "purchase_order_line_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_cost" DECIMAL(14,4) NOT NULL,
    "unit_of_measure" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipt_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "goods_receipt_lines_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "goods_receipt_lines_unit_cost_not_negative" CHECK ("unit_cost" >= 0),
    CONSTRAINT "goods_receipt_lines_unit_of_measure_present" CHECK (length(trim("unit_of_measure")) > 0)
);

-- One entry per order line per receipt.
CREATE UNIQUE INDEX "goods_receipt_lines_org_receipt_line_key"
  ON "goods_receipt_lines" ("organization_id", "goods_receipt_id", "purchase_order_line_id");

CREATE INDEX "goods_receipt_lines_org_receipt_idx"
  ON "goods_receipt_lines" ("organization_id", "goods_receipt_id");

CREATE INDEX "goods_receipt_lines_org_order_line_idx"
  ON "goods_receipt_lines" ("organization_id", "purchase_order_line_id");

ALTER TABLE "goods_receipt_lines"
  ADD CONSTRAINT "goods_receipt_lines_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The composite foreign keys keep the line inside one organization, on one
-- receipt of that organization, against one order line of that organization.
ALTER TABLE "goods_receipt_lines"
  ADD CONSTRAINT "goods_receipt_lines_organization_id_goods_receipt_id_fkey"
  FOREIGN KEY ("organization_id", "goods_receipt_id") REFERENCES "goods_receipts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "goods_receipt_lines"
  ADD CONSTRAINT "goods_receipt_lines_organization_id_purchase_order_line_id_fkey"
  FOREIGN KEY ("organization_id", "purchase_order_line_id") REFERENCES "purchase_order_lines"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "goods_receipt_lines"
  ADD CONSTRAINT "goods_receipt_lines_organization_id_product_id_fkey"
  FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-level security with no policies.
ALTER TABLE "goods_receipt_lines" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Append-only: reject any UPDATE or DELETE on goods_receipt_lines
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  target_schema text := current_schema();
BEGIN
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.goods_receipt_lines_reject_update()
       RETURNS trigger
       LANGUAGE plpgsql
       SET search_path = %L
       AS %L',
    target_schema,
    '',
    $fn$
      BEGIN
        RAISE EXCEPTION 'goods_receipt_lines is append-only: UPDATE is not permitted';
      END;
    $fn$
  );

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.goods_receipt_lines_reject_delete()
       RETURNS trigger
       LANGUAGE plpgsql
       SET search_path = %L
       AS %L',
    target_schema,
    '',
    $fn$
      BEGIN
        RAISE EXCEPTION 'goods_receipt_lines is append-only: DELETE is not permitted';
      END;
    $fn$
  );
END $$;

DROP TRIGGER IF EXISTS goods_receipt_lines_reject_update ON "goods_receipt_lines";
CREATE TRIGGER goods_receipt_lines_reject_update
  BEFORE UPDATE ON "goods_receipt_lines"
  FOR EACH ROW
  EXECUTE FUNCTION goods_receipt_lines_reject_update();

DROP TRIGGER IF EXISTS goods_receipt_lines_reject_delete ON "goods_receipt_lines";
CREATE TRIGGER goods_receipt_lines_reject_delete
  BEFORE DELETE ON "goods_receipt_lines"
  FOR EACH ROW
  EXECUTE FUNCTION goods_receipt_lines_reject_delete();

-- ---------------------------------------------------------------------------
-- Statement-level protection: no TRUNCATE
-- ---------------------------------------------------------------------------
REVOKE TRUNCATE ON TABLE "goods_receipt_lines" FROM PUBLIC;
