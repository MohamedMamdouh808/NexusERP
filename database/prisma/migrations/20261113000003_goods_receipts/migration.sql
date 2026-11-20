-- Migration: the goods receipts.
--
-- A permanent record that goods arrived against a purchase order. A posted
-- receipt is never edited and never removed: the receipt history is the
-- organization's proof of what was received, and a corrected receipt would
-- make that proof a guess.
--
-- The append-only enforcement is in the DATABASE, not in the application: a
-- BEFORE UPDATE and a BEFORE DELETE trigger raise, and TRUNCATE is revoked -
-- the same mechanism the audit log and the movement ledger already use.
--
-- The supplier and the warehouse are read from the purchase order and are not
-- duplicated here: a receipt that copied them could disagree with its order.
--
-- LIMITATION (documented and accepted, as it is for the audit log and the
-- movement ledger): the table owner can drop these triggers or re-grant the
-- TRUNCATE privilege.
--
-- Row-level security is enabled with NO policies.
--
-- Schema-neutral: created in the schema the migration is applied to. Every name
-- is snake_case, per the convention in database/README.md.

CREATE TABLE "goods_receipts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "number" VARCHAR(32) NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "received_by" UUID NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- One number per organization.
CREATE UNIQUE INDEX "goods_receipts_organization_id_number_key"
  ON "goods_receipts" ("organization_id", "number");

-- The composite key the receipt line's foreign key is built on.
CREATE UNIQUE INDEX "goods_receipts_organization_id_id_key"
  ON "goods_receipts" ("organization_id", "id");

-- The list is read by received date, and the order detail reads its receipts.
CREATE INDEX "goods_receipts_org_received_idx"
  ON "goods_receipts" ("organization_id", "received_at");

CREATE INDEX "goods_receipts_org_order_idx"
  ON "goods_receipts" ("organization_id", "purchase_order_id");

ALTER TABLE "goods_receipts"
  ADD CONSTRAINT "goods_receipts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The composite foreign key keeps the receipt inside one organization and on
-- one of that organization's orders.
ALTER TABLE "goods_receipts"
  ADD CONSTRAINT "goods_receipts_organization_id_purchase_order_id_fkey"
  FOREIGN KEY ("organization_id", "purchase_order_id") REFERENCES "purchase_orders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The clerk who received the goods. The receipt survives the deletion of the
-- account: the record of what arrived outlives the person who received it.
ALTER TABLE "goods_receipts"
  ADD CONSTRAINT "goods_receipts_received_by_fkey"
  FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-level security with no policies.
ALTER TABLE "goods_receipts" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Append-only: reject any UPDATE or DELETE on goods_receipts
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  target_schema text := current_schema();
BEGIN
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.goods_receipts_reject_update()
       RETURNS trigger
       LANGUAGE plpgsql
       SET search_path = %L
       AS %L',
    target_schema,
    '',
    $fn$
      BEGIN
        RAISE EXCEPTION 'goods_receipts is append-only: UPDATE is not permitted';
      END;
    $fn$
  );

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION %I.goods_receipts_reject_delete()
       RETURNS trigger
       LANGUAGE plpgsql
       SET search_path = %L
       AS %L',
    target_schema,
    '',
    $fn$
      BEGIN
        RAISE EXCEPTION 'goods_receipts is append-only: DELETE is not permitted';
      END;
    $fn$
  );
END $$;

DROP TRIGGER IF EXISTS goods_receipts_reject_update ON "goods_receipts";
CREATE TRIGGER goods_receipts_reject_update
  BEFORE UPDATE ON "goods_receipts"
  FOR EACH ROW
  EXECUTE FUNCTION goods_receipts_reject_update();

DROP TRIGGER IF EXISTS goods_receipts_reject_delete ON "goods_receipts";
CREATE TRIGGER goods_receipts_reject_delete
  BEFORE DELETE ON "goods_receipts"
  FOR EACH ROW
  EXECUTE FUNCTION goods_receipts_reject_delete();

-- ---------------------------------------------------------------------------
-- Statement-level protection: no TRUNCATE
-- ---------------------------------------------------------------------------
REVOKE TRUNCATE ON TABLE "goods_receipts" FROM PUBLIC;
