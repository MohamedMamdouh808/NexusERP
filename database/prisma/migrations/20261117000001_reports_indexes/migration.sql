-- Indexes supporting the Reports queries (feature 015). Append-only.
CREATE INDEX IF NOT EXISTS "stock_balances_org_warehouse_idx"
  ON "stock_balances" ("organization_id", "warehouse_id");

CREATE INDEX IF NOT EXISTS "stock_movements_org_product_created_idx"
  ON "stock_movements" ("organization_id", "product_id", "created_at");

CREATE INDEX IF NOT EXISTS "stock_movements_org_warehouse_created_idx"
  ON "stock_movements" ("organization_id", "warehouse_id", "created_at");

CREATE INDEX IF NOT EXISTS "invoices_org_status_due_date_idx"
  ON "invoices" ("organization_id", "status", "due_date");