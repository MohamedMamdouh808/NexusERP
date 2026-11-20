-- Migration: invoice_balances - the one shared definition.
--
-- The rule is stated ONCE, here, and every reader of it - the invoice list
-- (row balances, the outstanding/overdue aggregates for the whole selection,
-- one snapshot), the invoice detail, the record-payment screen
-- (GET /invoices/open), the later Outstanding Invoices report and the
-- Dashboard - asks this view. Nothing reimplements the definition.
--
--   organization_id | invoice_id | total | allocated | balance | is_overdue
--
--   allocated = sum of the allocations of payments with NO reversal
--               (a reversed payment's allocations do not count);
--   balance   = total - allocated;
--   is_overdue = due_date < (now() AT TIME ZONE 'UTC')::date AND balance > 0.
--
-- A DRAFT invoice has no allocations, so its balance equals its total. A VOID
-- invoice's active allocations are always zero (void refuses when any exist and
-- reversal empties them), so its balance equals its total - the view states the
-- definition, the readers decide what to display.
--
-- The view is read-only by construction (a plain SELECT over joined tables);
-- no role is granted write access to it, and TRUNCATE/UPDATE/DELETE simply do
-- not apply. Schema-neutral, like every other object here.

CREATE VIEW "invoice_balances" AS
SELECT
  i."organization_id" AS "organization_id",
  i."id" AS "invoice_id",
  i."total" AS "total",
  COALESCE(
    SUM(a."amount") FILTER (WHERE r."id" IS NULL),
    0
  )::numeric(14,2) AS "allocated",
  (
    i."total" - COALESCE(
      SUM(a."amount") FILTER (WHERE r."id" IS NULL),
      0
    )
  )::numeric(14,2) AS "balance",
  (
    i."due_date" IS NOT NULL
    AND i."due_date" < (now() AT TIME ZONE 'UTC')::date
    AND (
      i."total" - COALESCE(
        SUM(a."amount") FILTER (WHERE r."id" IS NULL),
        0
      )
    ) > 0
  ) AS "is_overdue"
FROM "invoices" i
LEFT JOIN "payment_allocations" a
  ON a."organization_id" = i."organization_id"
 AND a."invoice_id" = i."id"
LEFT JOIN "payment_reversals" r
  ON r."organization_id" = a."organization_id"
 AND r."payment_id" = a."payment_id"
GROUP BY i."organization_id", i."id", i."total", i."due_date";
