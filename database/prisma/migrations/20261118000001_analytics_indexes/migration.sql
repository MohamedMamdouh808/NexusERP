-- Indexes supporting the analytics queries (feature 016). Append-only.
CREATE INDEX IF NOT EXISTS "payments_org_payment_date_idx"
  ON "payments" ("organization_id", "payment_date");

CREATE INDEX IF NOT EXISTS "invoices_org_issue_date_idx"
  ON "invoices" ("organization_id", "issue_date");

CREATE INDEX IF NOT EXISTS "purchase_orders_org_order_date_idx"
  ON "purchase_orders" ("organization_id", "order_date");