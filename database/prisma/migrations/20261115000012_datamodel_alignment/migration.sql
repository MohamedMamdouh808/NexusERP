-- Migration: align the physical catalogue with the declared datamodel.
--
-- Feature 013 adopted the snake_case column convention everywhere (every
-- scalar carries @map), which changes the names Prisma DERIVES for every
-- foreign key, and the hand-authored migrations of the earlier features never
-- matched that derivation exactly: some constraints were created without
-- ON UPDATE CASCADE, nine constraints the datamodel declares were never created
-- at all (sales_orders had none), a handful of defaults and two indexes exist
-- only in the database. `prisma migrate diff` (FR-048, proved by the reference
-- data suite) fails on those tables, and CI runs that check after the suites.
--
-- This migration is pure alignment:
--   - foreign keys are dropped and re-added with the SAME names and the
--     declared ON DELETE / ON UPDATE actions (Postgres cannot alter a
--     referential action in place);
--   - the nine constraints the datamodel declares but the database never had
--     are created;
--   - defaults the datamodel does not declare are dropped (@updatedAt and
--     @default(uuid()) are client-side, so the database must not invent them);
--   - the composite primary key of stock_balances is dropped: the datamodel
--     keeps uniqueness on the same three columns through the unique index
--     stock_balances_org_warehouse_product_key, and no other table references
--     the key;
--   - the redundant unique index on shipment_lines (organization_id, id) is
--     dropped (id is already the primary key);
--   - warehouses' constraint is renamed to the name the @map convention
--     derives.
--   - products keeps its (organization_id, unit_id) index: it supports the
--     unit join, so the datamodel now declares it rather than the database
--     carrying an undeclared object.
--
-- Everything is a rename, a default drop, an index drop or a constraint
-- swap: no column changes, no data changes, no behaviour change.
-- Schema-neutral, per the convention in database/README.md.

-- warehouses: the constraint predates the @map convention.
ALTER TABLE "warehouses" RENAME CONSTRAINT "warehouses_organizationId_fkey" TO "warehouses_organization_id_fkey";

-- invoice_lines
ALTER TABLE "invoice_lines" DROP CONSTRAINT "invoice_lines_organization_id_fkey";
ALTER TABLE "invoice_lines" DROP CONSTRAINT "invoice_lines_organization_id_invoice_id_fkey";
ALTER TABLE "invoice_lines" DROP CONSTRAINT "invoice_lines_organization_id_product_id_fkey";
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_organization_id_invoice_id_fkey" FOREIGN KEY ("organization_id", "invoice_id") REFERENCES "invoices"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- invoices
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_created_by_fkey";
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_organization_id_customer_id_fkey";
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_organization_id_fkey";
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_organization_id_sales_order_id_fkey";
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_voided_by_fkey";
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_sales_order_id_fkey" FOREIGN KEY ("organization_id", "sales_order_id") REFERENCES "sales_orders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_customer_id_fkey" FOREIGN KEY ("organization_id", "customer_id") REFERENCES "contacts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_voided_by_fkey" FOREIGN KEY ("voided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ALTER COLUMN "updated_at" DROP DEFAULT;

-- payment_allocations
ALTER TABLE "payment_allocations" DROP CONSTRAINT "payment_allocations_organization_id_fkey";
ALTER TABLE "payment_allocations" DROP CONSTRAINT "payment_allocations_organization_id_invoice_id_fkey";
ALTER TABLE "payment_allocations" DROP CONSTRAINT "payment_allocations_organization_id_payment_id_fkey";
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_organization_id_payment_id_fkey" FOREIGN KEY ("organization_id", "payment_id") REFERENCES "payments"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_organization_id_invoice_id_fkey" FOREIGN KEY ("organization_id", "invoice_id") REFERENCES "invoices"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- payment_reversals
ALTER TABLE "payment_reversals" DROP CONSTRAINT "payment_reversals_organization_id_fkey";
ALTER TABLE "payment_reversals" DROP CONSTRAINT "payment_reversals_organization_id_payment_id_fkey";
ALTER TABLE "payment_reversals" DROP CONSTRAINT "payment_reversals_reversed_by_fkey";
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_organization_id_payment_id_fkey" FOREIGN KEY ("organization_id", "payment_id") REFERENCES "payments"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_reversed_by_fkey" FOREIGN KEY ("reversed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- payments
ALTER TABLE "payments" DROP CONSTRAINT "payments_organization_id_customer_id_fkey";
ALTER TABLE "payments" DROP CONSTRAINT "payments_organization_id_fkey";
ALTER TABLE "payments" DROP CONSTRAINT "payments_recorded_by_fkey";
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_customer_id_fkey" FOREIGN KEY ("organization_id", "customer_id") REFERENCES "contacts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- product_categories
ALTER TABLE "product_categories" DROP CONSTRAINT "product_categories_organization_id_fkey";
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_categories" ALTER COLUMN "id" DROP DEFAULT;

-- products
ALTER TABLE "products" DROP CONSTRAINT "products_organization_id_category_id_fkey";
ALTER TABLE "products" DROP CONSTRAINT "products_organization_id_fkey";
ALTER TABLE "products" DROP CONSTRAINT "products_organization_id_unit_id_fkey";
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_category_id_fkey" FOREIGN KEY ("organization_id", "category_id") REFERENCES "product_categories"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_organization_id_unit_id_fkey" FOREIGN KEY ("organization_id", "unit_id") REFERENCES "units_of_measure"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- purchase_order_lines / purchase_orders: the datamodel carries no default on
-- updated_at (@updatedAt is client-side).
ALTER TABLE "purchase_order_lines" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "purchase_orders" ALTER COLUMN "updated_at" DROP DEFAULT;

-- sales_order_lines: the (organization_id) constraint was never created.
ALTER TABLE "sales_order_lines" DROP CONSTRAINT "sales_order_lines_organization_id_product_id_fkey";
ALTER TABLE "sales_order_lines" DROP CONSTRAINT "sales_order_lines_organization_id_sales_order_id_fkey";
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_organization_id_sales_order_id_fkey" FOREIGN KEY ("organization_id", "sales_order_id") REFERENCES "sales_orders"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_order_lines" ADD CONSTRAINT "sales_order_lines_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_order_lines" ALTER COLUMN "updated_at" DROP DEFAULT;

-- sales_orders: all four constraints were never created.
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_organization_id_customer_id_fkey" FOREIGN KEY ("organization_id", "customer_id") REFERENCES "contacts"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_organization_id_warehouse_id_fkey" FOREIGN KEY ("organization_id", "warehouse_id") REFERENCES "warehouses"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales_orders" ALTER COLUMN "updated_at" DROP DEFAULT;

-- stock_balances: uniqueness stays with the unique index; the composite
-- primary key is not part of the datamodel.
ALTER TABLE "stock_balances" DROP CONSTRAINT "stock_balances_pkey",
ALTER COLUMN "updated_at" DROP DEFAULT;

-- stock_reservations: the (organization_id) constraint was never created.
ALTER TABLE "stock_reservations" DROP CONSTRAINT "stock_reservations_organization_id_product_id_fkey";
ALTER TABLE "stock_reservations" DROP CONSTRAINT "stock_reservations_organization_id_sales_order_line_id_fkey";
ALTER TABLE "stock_reservations" DROP CONSTRAINT "stock_reservations_organization_id_warehouse_id_fkey";
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_organization_id_sales_order_line_id_fkey" FOREIGN KEY ("organization_id", "sales_order_line_id") REFERENCES "sales_order_lines"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_organization_id_warehouse_id_fkey" FOREIGN KEY ("organization_id", "warehouse_id") REFERENCES "warehouses"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- units_of_measure
ALTER TABLE "units_of_measure" DROP CONSTRAINT "units_of_measure_organization_id_fkey";
ALTER TABLE "units_of_measure" ADD CONSTRAINT "units_of_measure_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "units_of_measure" ALTER COLUMN "id" DROP DEFAULT;

-- shipments: the (organization_id) and (shipped_by) constraints were never
-- created.
ALTER TABLE "shipments" DROP CONSTRAINT "shipments_organization_id_sales_order_id_fkey";
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_organization_id_sales_order_id_fkey" FOREIGN KEY ("organization_id", "sales_order_id") REFERENCES "sales_orders"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_shipped_by_fkey" FOREIGN KEY ("shipped_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- shipment_lines: the (organization_id) constraint was never created, and the
-- unique index on (organization_id, id) is redundant with the primary key.
DROP INDEX "shipment_lines_organization_id_id_key";
ALTER TABLE "shipment_lines" DROP CONSTRAINT "shipment_lines_organization_id_product_id_fkey";
ALTER TABLE "shipment_lines" DROP CONSTRAINT "shipment_lines_organization_id_sales_order_line_id_fkey";
ALTER TABLE "shipment_lines" DROP CONSTRAINT "shipment_lines_organization_id_shipment_id_fkey";
ALTER TABLE "shipment_lines" ADD CONSTRAINT "shipment_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shipment_lines" ADD CONSTRAINT "shipment_lines_organization_id_shipment_id_fkey" FOREIGN KEY ("organization_id", "shipment_id") REFERENCES "shipments"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shipment_lines" ADD CONSTRAINT "shipment_lines_organization_id_sales_order_line_id_fkey" FOREIGN KEY ("organization_id", "sales_order_line_id") REFERENCES "sales_order_lines"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "shipment_lines" ADD CONSTRAINT "shipment_lines_organization_id_product_id_fkey" FOREIGN KEY ("organization_id", "product_id") REFERENCES "products"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
