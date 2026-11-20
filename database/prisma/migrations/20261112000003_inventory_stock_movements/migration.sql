-- Migration: the stock movement ledger.
--
-- One row per quantity change, and the row is never changed or removed: the
-- on-hand quantity of a balance is always the sum of its movements, so an
-- edited movement would make that sum a lie. The append-only enforcement
-- (triggers and the revoked truncate privilege) is added by the next migration,
-- which copies the mechanism the audit log already uses.
--
-- The quantity is signed: a receipt is positive, a shipment is negative, an
-- adjustment is whichever it is. It is never zero - a movement that changes
-- nothing is not a movement.
--
-- Row-level security is enabled with NO policies, exactly as every other table
-- in this schema does.
--
-- Schema-neutral: created in the schema the migration is applied to, so the
-- isolated test schema and the shared schema stay in parity. Every name is
-- snake_case, per the convention in database/README.md.

CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "type" VARCHAR(16) NOT NULL,
    "quantity_delta" DECIMAL(14,3) NOT NULL,
    "reason" VARCHAR(32),
    "note" VARCHAR(500),
    "source_type" VARCHAR(32) NOT NULL,
    "source_id" UUID,
    "source_number" VARCHAR(32),
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stock_movements_quantity_not_zero" CHECK ("quantity_delta" <> 0),
    CONSTRAINT "stock_movements_type_known" CHECK ("type" IN ('RECEIPT', 'SHIPMENT', 'ADJUSTMENT')),
    CONSTRAINT "stock_movements_reason_known" CHECK ("reason" IS NULL OR "reason" IN ('DAMAGE', 'LOSS', 'FOUND', 'COUNT_CORRECTION', 'OTHER')),
    -- A note is required when the reason is OTHER; the rule is stated once, here.
    CONSTRAINT "stock_movements_other_requires_note" CHECK ("reason" <> 'OTHER' OR ("note" IS NOT NULL AND length(trim("note")) > 0))
);

-- The ledger is read by time, by product and by warehouse.
CREATE INDEX "stock_movements_org_created_idx"
  ON "stock_movements" ("organization_id", "created_at");

CREATE INDEX "stock_movements_org_product_idx"
  ON "stock_movements" ("organization_id", "product_id");

CREATE INDEX "stock_movements_org_warehouse_idx"
  ON "stock_movements" ("organization_id", "warehouse_id");

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The composite foreign keys keep a movement inside one organization.
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_organization_id_warehouse_id_fkey"
  FOREIGN KEY ("organization_id", "warehouse_id") REFERENCES "warehouses"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_organization_id_product_id_fkey"
  FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The acting user: the ledger survives the deletion of the account (the
-- history of a quantity change outlives the person who made it).
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-level security with no policies: the table is invisible to every role
-- that is not the table owner.
ALTER TABLE "stock_movements" ENABLE ROW LEVEL SECURITY;
