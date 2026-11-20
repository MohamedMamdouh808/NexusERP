-- Migration: the low-stock rule gains an explicit "is low" flag.
--
-- The view already computes the STATUS of every product with a threshold
-- (OUT_OF_STOCK, LOW_STOCK, IN_STOCK), but "low" was implied: a reader had to
-- know that a product is low unless its status is IN_STOCK. That is a second
-- reading of the rule, and the low-stock list and the low-stock count could
-- drift apart.
--
-- The flag makes the rule explicit and machine-readable: a product is low
-- when its total available is at or below its threshold. The list, the count,
-- the status pill on a row and the dashboard metric that will come later all
-- read THIS column, so they cannot disagree.
--
-- The view is REPLACED, not dropped and recreated: the existing columns keep
-- their names, their types and their order, and the flag is appended.
--
-- Schema-neutral: created in the schema the migration is applied to, so the
-- isolated test schema and the shared schema stay in parity. Every name is
-- snake_case, per the convention in database/README.md.

CREATE OR REPLACE VIEW "inventory_low_stock_products" AS
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
  END AS "status",
  -- The rule itself: low when the total available is at or below the
  -- threshold. A threshold of zero therefore means "low when nothing is
  -- available", and a product with no movements at all (total zero) is low
  -- when it has a threshold.
  COALESCE(
    SUM(
      CASE
        WHEN w."id" IS NOT NULL THEN sb."on_hand" - sb."reserved"
        ELSE 0
      END
    ),
    0
  ) <= p."low_stock_threshold" AS "is_low"
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
