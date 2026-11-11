-- Migration: audit_logs trigger search_path hardening, truncate trigger, RLS parity, and reference data backfill.
--
-- 1. Recreate audit_logs_reject_update and audit_logs_reject_delete with
--    SET search_path = '' and schema-qualified references (pg_catalog.pg_trigger_depth)
--    to eliminate the Supabase / PostgreSQL linter warning about mutable search_path.
-- 2. Add audit_logs_reject_truncate trigger function and BEFORE TRUNCATE trigger to prevent
--    statement-level truncation of audit_logs by ANY script, test, or migration.
-- 3. Enable RLS on all 14 application tables without schema prefix so that fresh isolated
--    schemas achieve RLS parity with public.
-- 4. Idempotently populate reference permissions (25), role templates (5), and template
--    permissions (68), and backfill role_permissions for all roles lacking permission links.

-- ---------------------------------------------------------------------------
-- 1. Trigger functions with SET search_path = '' and schema-qualified refs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_logs_reject_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Referential-integrity actions (ON DELETE SET NULL) execute their internal UPDATE
  -- at depth 2, beneath the RI trigger that the DELETE fired. Anything else - a
  -- client UPDATE in a transaction - arrives at depth 1 and is rejected.
  IF pg_catalog.pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_logs is append-only: UPDATE is not permitted';
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_logs_reject_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: DELETE is not permitted';
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_logs_reject_truncate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: TRUNCATE is not permitted';
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Attach triggers to audit_logs
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS audit_logs_reject_update ON "audit_logs";
CREATE TRIGGER audit_logs_reject_update
  BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_logs_reject_update();

DROP TRIGGER IF EXISTS audit_logs_reject_delete ON "audit_logs";
CREATE TRIGGER audit_logs_reject_delete
  BEFORE DELETE ON "audit_logs"
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_logs_reject_delete();

DROP TRIGGER IF EXISTS audit_logs_reject_truncate ON "audit_logs";
CREATE TRIGGER audit_logs_reject_truncate
  BEFORE TRUNCATE ON "audit_logs"
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.audit_logs_reject_truncate();

-- ---------------------------------------------------------------------------
-- 3. Schema-neutral RLS on all tables (works in public and isolated schemas)
-- ---------------------------------------------------------------------------
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_sequences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "login_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "membership_roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_template_permissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "role_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "warehouses" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. Reference permissions (25 rows)
-- ---------------------------------------------------------------------------
INSERT INTO "permissions" ("id", "code", "module", "description", "createdAt")
VALUES (gen_random_uuid(), 'contacts.read', 'contacts', 'View customers and suppliers', now())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "permissions" ("id", "code", "module", "description", "createdAt")
VALUES (gen_random_uuid(), 'contacts.write', 'contacts', 'Create, edit and archive contacts', now())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "permissions" ("id", "code", "module", "description", "createdAt")
VALUES (gen_random_uuid(), 'products.read', 'products', 'View products, categories and units', now())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "permissions" ("id", "code", "module", "description", "createdAt")
VALUES (gen_random_uuid(), 'products.write', 'products', 'Create, edit and archive products and their categories', now())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "permissions" ("id", "code", "module", "description", "createdAt")
VALUES (gen_random_uuid(), 'inventory.read', 'inventory', 'View stock balances and movements', now())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "permissions" ("id", "code", "module", "description", "createdAt")
VALUES (gen_random_uuid(), 'inventory.write', 'inventory', 'Manage warehouses', now())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "permissions" ("id", "code", "module", "description", "createdAt")
VALUES (gen_random_uuid(), 'inventory.receive', 'inventory', 'Receive goods against a purchase order', now())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "permissions" ("id", "code", "module", "description", "createdAt")
VALUES (gen_random_uuid(), 'inventory.ship', 'inventory', 'Post a shipment and deduct stock', now())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "permissions" ("id", "code", "module", "description", "createdAt")
VALUES (gen_random_uuid(), 'inventory.adjust', 'inventory', 'Post a stock adjustment with a reason', now())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "permissions" ("id", "code", "module", "description", "createdAt")
VALUES (gen_random_uuid(), 'purchasing.read', 'purchasing', 'View purchase orders and receipts', now())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "permissions" ("id", "code", "module", "description", "createdAt")
VALUES (gen_random_uuid(), 'purchasing.write', 'purchasing', 'Create, confirm and cancel purchase orders', now())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "permissions" ("id", "code", "module", "description", "createdAt")
VALUES (gen_random_uuid(), 'sales.read', 'sales', 'View sales orders', now())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "permissions" ("id", "code", "module", "description", "createdAt")
VALUES (gen_random_uuid(), 'sales.write', 'sales', 'Create, confirm and cancel sales orders', now())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "permissions" ("id", "code", "module", "description", "createdAt")
VALUES (gen_random_uuid(), 'invoices.read', 'invoices', 'View invoices', now())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "permissions" ("id", "code", "module", "description", "createdAt")
VALUES (gen_random_uuid(), 'invoices.write', 'invoices', 'Create and edit draft invoices', now())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "permissions" ("id", "code", "module", "description", "createdAt")
VALUES (gen_random_uuid(), 'invoices.issue', 'invoices', 'Issue an invoice, making it immutable', now())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "permissions" ("id", "code", "module", "description", "createdAt")
VALUES (gen_random_uuid(), 'invoices.void', 'invoices', 'Void an issued invoice with a reason', now())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "permissions" ("id", "code", "module", "description", "createdAt")
VALUES (gen_random_uuid(), 'payments.read', 'payments', 'View payments and allocations', now())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "permissions" ("id", "code", "module", "description", "createdAt")
VALUES (gen_random_uuid(), 'payments.record', 'payments', 'Record a payment and allocate it', now())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "permissions" ("id", "code", "module", "description", "createdAt")
VALUES (gen_random_uuid(), 'payments.reverse', 'payments', 'Reverse a payment with a reason', now())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "permissions" ("id", "code", "module", "description", "createdAt")
VALUES (gen_random_uuid(), 'reports.read', 'reports', 'View operational reports', now())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "permissions" ("id", "code", "module", "description", "createdAt")
VALUES (gen_random_uuid(), 'audit.read', 'audit', 'View the audit log', now())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "permissions" ("id", "code", "module", "description", "createdAt")
VALUES (gen_random_uuid(), 'users.manage', 'users', 'Create users and manage memberships', now())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "permissions" ("id", "code", "module", "description", "createdAt")
VALUES (gen_random_uuid(), 'roles.manage', 'roles', 'Create roles and assign permissions', now())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "permissions" ("id", "code", "module", "description", "createdAt")
VALUES (gen_random_uuid(), 'settings.manage', 'settings', 'Change organization settings and modules', now())
ON CONFLICT ("code") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Reference role templates (5 rows)
-- ---------------------------------------------------------------------------
INSERT INTO "role_templates" ("id", "key", "name", "description", "isSystem", "createdAt")
VALUES (gen_random_uuid(), 'administrator', 'Administrator', 'Full access to every module and every administrative action.', true, now())
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_templates" ("id", "key", "name", "description", "isSystem", "createdAt")
VALUES (gen_random_uuid(), 'manager', 'Manager', 'Every operational action, without user, role or settings administration.', true, now())
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_templates" ("id", "key", "name", "description", "isSystem", "createdAt")
VALUES (gen_random_uuid(), 'sales', 'Sales', 'Contacts, products, stock visibility, sales orders and invoice visibility.', true, now())
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_templates" ("id", "key", "name", "description", "isSystem", "createdAt")
VALUES (gen_random_uuid(), 'inventory', 'Inventory', 'Products, stock, goods receipt, shipment and adjustment, with purchasing and sales visibility.', true, now())
ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_templates" ("id", "key", "name", "description", "isSystem", "createdAt")
VALUES (gen_random_uuid(), 'purchasing', 'Purchasing', 'Contacts, products, stock visibility and purchase orders.', true, now())
ON CONFLICT ("key") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Role template permissions (68 links)
-- ---------------------------------------------------------------------------
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'administrator' AND p."code" = 'contacts.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'administrator' AND p."code" = 'contacts.write'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'administrator' AND p."code" = 'products.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'administrator' AND p."code" = 'products.write'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'administrator' AND p."code" = 'inventory.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'administrator' AND p."code" = 'inventory.write'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'administrator' AND p."code" = 'inventory.receive'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'administrator' AND p."code" = 'inventory.ship'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'administrator' AND p."code" = 'inventory.adjust'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'administrator' AND p."code" = 'purchasing.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'administrator' AND p."code" = 'purchasing.write'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'administrator' AND p."code" = 'sales.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'administrator' AND p."code" = 'sales.write'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'administrator' AND p."code" = 'invoices.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'administrator' AND p."code" = 'invoices.write'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'administrator' AND p."code" = 'invoices.issue'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'administrator' AND p."code" = 'invoices.void'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'administrator' AND p."code" = 'payments.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'administrator' AND p."code" = 'payments.record'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'administrator' AND p."code" = 'payments.reverse'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'administrator' AND p."code" = 'reports.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'administrator' AND p."code" = 'audit.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'administrator' AND p."code" = 'users.manage'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'administrator' AND p."code" = 'roles.manage'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'administrator' AND p."code" = 'settings.manage'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'manager' AND p."code" = 'contacts.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'manager' AND p."code" = 'contacts.write'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'manager' AND p."code" = 'products.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'manager' AND p."code" = 'products.write'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'manager' AND p."code" = 'inventory.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'manager' AND p."code" = 'inventory.write'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'manager' AND p."code" = 'inventory.receive'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'manager' AND p."code" = 'inventory.ship'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'manager' AND p."code" = 'inventory.adjust'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'manager' AND p."code" = 'purchasing.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'manager' AND p."code" = 'purchasing.write'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'manager' AND p."code" = 'sales.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'manager' AND p."code" = 'sales.write'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'manager' AND p."code" = 'invoices.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'manager' AND p."code" = 'invoices.write'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'manager' AND p."code" = 'invoices.issue'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'manager' AND p."code" = 'invoices.void'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'manager' AND p."code" = 'payments.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'manager' AND p."code" = 'payments.record'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'manager' AND p."code" = 'payments.reverse'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'manager' AND p."code" = 'reports.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'manager' AND p."code" = 'audit.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'sales' AND p."code" = 'contacts.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'sales' AND p."code" = 'contacts.write'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'sales' AND p."code" = 'products.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'sales' AND p."code" = 'inventory.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'sales' AND p."code" = 'sales.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'sales' AND p."code" = 'sales.write'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'sales' AND p."code" = 'invoices.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'inventory' AND p."code" = 'products.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'inventory' AND p."code" = 'inventory.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'inventory' AND p."code" = 'inventory.write'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'inventory' AND p."code" = 'inventory.receive'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'inventory' AND p."code" = 'inventory.ship'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'inventory' AND p."code" = 'inventory.adjust'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'inventory' AND p."code" = 'purchasing.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'inventory' AND p."code" = 'sales.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'purchasing' AND p."code" = 'contacts.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'purchasing' AND p."code" = 'contacts.write'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'purchasing' AND p."code" = 'products.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'purchasing' AND p."code" = 'inventory.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'purchasing' AND p."code" = 'purchasing.read'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;
INSERT INTO "role_template_permissions" ("roleTemplateId", "permissionId", "createdAt")
SELECT rt."id", p."id", now()
FROM "role_templates" rt, "permissions" p
WHERE rt."key" = 'purchasing' AND p."code" = 'purchasing.write'
ON CONFLICT ("roleTemplateId", "permissionId") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. Service role grants parity
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA ' || quote_ident(current_schema()) || ' TO service_role';
    EXECUTE 'GRANT TRUNCATE ON ALL TABLES IN SCHEMA ' || quote_ident(current_schema()) || ' TO service_role';
    EXECUTE 'REVOKE TRUNCATE ON TABLE "audit_logs" FROM service_role';
    EXECUTE 'REVOKE TRUNCATE ON TABLE "audit_logs" FROM postgres';
    EXECUTE 'REVOKE TRUNCATE ON TABLE "audit_logs" FROM PUBLIC';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 8. Backfill role_permissions for all roles lacking permission links
-- ---------------------------------------------------------------------------
INSERT INTO "role_permissions" ("roleId", "permissionId", "createdAt")
SELECT r."id", p."id", now()
FROM "roles" r
JOIN "role_templates" rt ON rt."key" = r."key"
JOIN "role_template_permissions" rtp ON rtp."roleTemplateId" = rt."id"
JOIN "permissions" p ON p."id" = rtp."permissionId"
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
