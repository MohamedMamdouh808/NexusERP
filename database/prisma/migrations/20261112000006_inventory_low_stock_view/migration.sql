-- Migration: the single low-stock rule.
--
-- The rule is stated ONCE, here, and every reader of it - the balances list,
-- the low-stock count, the status shown on a row and the dashboard metric that
-- will come later - asks this view. A second implementation would be a second
-- answer, and the count would stop matching the filter.
--
-- The rule, as confirmed for this feature:
--
--   1. Scope: non-archived products that have a configured threshold. An
--      archived product is never low stock, and a product without a threshold
--      has no status at all (the service answers "none" for it).
--   2. Quantity: the sum over ACTIVE warehouses of (on hand minus reserved).
--      Reserved stock counts as unavailable, and stock sitting in a deactivated
--      warehouse does not count at all.
--   3. Low when that total is at or below the threshold - a threshold of zero
--      therefore means "low when nothing is available".
--   4. A product with no balance rows at all has a total of zero, so a product
--      with a threshold and no movements IS low stock. The LEFT JOIN is what
--      makes that true: the aggregation starts from the products, never from
--      the balance rows.
--
-- The status ladder: out of stock (total at or below zero) takes precedence,
-- then low stock, then in stock.
--
-- Schema-neutral: created in the schema the migration is applied to, so the
-- isolated test schema and the shared schema stay in parity. Every name is
-- snake_case, per the convention in database/README.md.

CREATE VIEW "inventory_low_stock_products" AS
SELECT
  p."organization_id",
  p."id" AS "product_id",
  p."sku",
  p."name" AS "product_name",
  p."low_stock_threshold" AS "threshold",
  COALESCE(
    SUM(
      CASE
        WHEN w."id" IS NOT NULL THEN sb."on_hand" - sb."reserved"
        ELSE 0
      END
    ),
    0
  )::numeric(14,3) AS "total_available",
  CASE
    WHEN COALESCE(
      SUM(
        CASE
          WHEN w."id" IS NOT NULL THEN sb."on_hand" - sb."reserved"
          ELSE 0
        END
      ),
      0
    ) <= 0 THEN 'OUT_OF_STOCK'
    WHEN COALESCE(
      SUM(
        CASE
          WHEN w."id" IS NOT NULL THEN sb."on_hand" - sb."reserved"
          ELSE 0
        END
      ),
      0
    ) <= p."low_stock_threshold" THEN 'LOW_STOCK'
    ELSE 'IN_STOCK'
  END AS "status"
FROM "products" p
-- The balances of every warehouse of the product, joined to the warehouses that
-- are ACTIVE. The condition lives in the join, so a balance in a deactivated
-- warehouse contributes zero instead of removing the row.
LEFT JOIN "stock_balances" sb
  ON sb."organization_id" = p."organization_id"
 AND sb."product_id" = p."id"
LEFT JOIN "warehouses" w
  ON w."organization_id" = sb."organization_id"
 AND w."id" = sb."warehouse_id"
 AND w."is_active" = true
WHERE p."is_archived" = false
  AND p."low_stock_threshold" IS NOT NULL
GROUP BY p."organization_id", p."id", p."sku", p."name", p."low_stock_threshold";
