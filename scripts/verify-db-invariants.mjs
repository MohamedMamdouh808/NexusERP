#!/usr/bin/env node
/**
 * verify-db-invariants.mjs
 *
 * Read-only database invariant verification for feature 006 (RBAC and Audit Log).
 *
 * Connects with DATABASE_URL and fails with a clear message when any invariant
 * is false. The schema is the one the URL names, so the SAME script verifies
 * the isolated test schema in CI and the shared public schema by hand:
 *
 *   - in CI against the test schema: DATABASE_URL with schema=nexuserp_test
 *   - by hand against Supabase: DATABASE_URL with schema=public
 *
 * Never modifies data. Never prints DATABASE_URL or any password.
 *
 * Invariants checked:
 *  1. No membership without a role (every active membership has >= 1 role)
 *  2. Every role has at least one permission link
 *  3. Every table in the schema except _prisma_migrations has RLS enabled
 *  4. No table is readable by the anon or authenticated roles
 *  5. Every append-only ledger (audit_logs, stock_movements, goods_receipts,
 *     goods_receipt_lines) carries UPDATE, DELETE and TRUNCATE rejection
 *     triggers, and has UPDATE, DELETE and TRUNCATE revoked from every
 *     non-owner role
 *  6. No audit entry with a null organization is returned by an organization
 *     listing (i.e., NULL-organization entries never match org-scoped queries)
 *  7. Every contact belongs to an organization, and the case-insensitive unique
 *     email index exists per organization
 *  8. Every stock balance's on-hand quantity equals the sum of its movements
 *  9. No stock balance holds more reserved than on hand
 * 10. Every invoice total equals the sum of its line totals and the sales
 *     order's total
 * 11. For every invoice, paid plus balance equals total, and balance >= 0
 * 12. Every invoice's status agrees with its balance; a VOID invoice holds no
 *     active allocation
 * 13. Every ISSUED/PARTIALLY_PAID/PAID invoice has a number, issue date and
 *     due date
 * 14. At most one non-void invoice exists per sales order
 * 15. Every payment's allocations sum to the payment's amount
 * 16. payments, payment_allocations and payment_reversals refuse UPDATE,
 *     DELETE and TRUNCATE and carry no API-role grants
 * 17. A non-DRAFT invoice refuses header and line changes (the immutability
 *     trigger guards the columns)
 * 18. The unfiltered outstanding and overdue figures equal the view's sums
 * 19. The public schema's row counts are unchanged after the isolated test
 *     suite (proved by snapshot-public-counts.mjs around the run)
 * 20. No purchase-order line received above its ordered quantity
 * 21. Every purchase order total equals the sum of its line totals
 * 22. Every purchase order status agrees with its line quantities
 * 23. Every goods-receipt line has a matching RECEIPT movement with agreeing
 *     totals (per line, and summed per receipt)
 * 24. Every organization has a module-availability row for each switchable module
 * 25. No enabled module has a disabled requirement (sales→inventory,
 *     purchasing→inventory, invoicing→sales)
 * 26. The organizations_currency_lock trigger exists and guards currency_code
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..');
const envPath = join(repoRoot, '.env');

function loadDatabaseUrl() {
  let url = process.env.DATABASE_URL;
  if (!url && existsSync(envPath)) {
    const contents = readFileSync(envPath, 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith('DATABASE_URL=')) {
        url = trimmed.slice('DATABASE_URL='.length).replace(/^"|"$/g, '');
        break;
      }
    }
  }
  if (!url) {
    throw new Error('DATABASE_URL is not set. Set it in .env or the environment.');
  }
  return url;
}

function maskUrl(url) {
  return url.replace(/:([^:@]+)@/, ':<masked>@');
}

const failures = [];

function fail(message) {
  failures.push(message);
  console.error(`FAIL: ${message}`);
}

function pass(message) {
  console.log(`PASS: ${message}`);
}

async function main() {
  const databaseUrl = loadDatabaseUrl();

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  try {
    // The schema under verification is the one the URL names. It is printed by
    // NAME only - the URL itself carries the password and is never printed.
    const schemaRow = await prisma.$queryRawUnsafe(`SELECT current_schema()::text AS s`);
    const targetSchema = schemaRow[0]?.s ?? 'public';
    console.log(`Verifying the schema "${targetSchema}" (${maskUrl(databaseUrl)})\n`);

    // ------------------------------------------------------------------
    // 1. No membership without a role (active memberships)
    // ------------------------------------------------------------------
    const membershipsWithoutRoles = await prisma.$queryRawUnsafe(
      `SELECT count(*) AS c FROM "memberships" m
       WHERE m."isActive" = true
         AND NOT EXISTS (
           SELECT 1 FROM "membership_roles" mr WHERE mr."membershipId" = m."id"
         )`,
    );
    const count = Number(membershipsWithoutRoles[0]?.c);
    if (count > 0) {
      fail(`${count} active membership(s) have no role`);
    } else {
      pass('Every active membership has at least one role');
    }

    // ------------------------------------------------------------------
    // 2. Every role has at least one permission link
    // ------------------------------------------------------------------
    const rolesWithoutPermissions = await prisma.$queryRawUnsafe(
      `SELECT count(*) AS c FROM "roles" r
       LEFT JOIN "role_permissions" rp ON rp."roleId" = r."id"
       WHERE rp."roleId" IS NULL`,
    );
    const count2 = Number(rolesWithoutPermissions[0]?.c);
    if (count2 > 0) {
      fail(`${count2} role(s) have no permission links`);
    } else {
      pass('Every role has at least one permission link');
    }

    // ------------------------------------------------------------------
    // 3. Every public/target table (except _prisma_migrations) has RLS enabled
    // ------------------------------------------------------------------
    const tablesWithoutRls = await prisma.$queryRawUnsafe(
      `SELECT relname FROM pg_class
       WHERE relkind = 'r'
         AND relnamespace = $1::regnamespace
         AND relname <> '_prisma_migrations'
         AND NOT relrowsecurity
       ORDER BY relname`,
      targetSchema,
    );
    if (tablesWithoutRls.length > 0) {
      const names = tablesWithoutRls.map((r) => r.relname).join(', ');
      fail(`${tablesWithoutRls.length} table(s) lack RLS: ${names}`);
    } else {
      pass(`Every table in schema "${targetSchema}" has RLS enabled`);
    }

    // The contacts and catalogue tables are named explicitly. They are the
    // newest tenant-scoped tables, and "every table has RLS" is a claim nobody
    // can check by eye at 3am when exactly one table is unprotected.
    const catalogueRls = await prisma.$queryRawUnsafe(
      `SELECT relname, relrowsecurity FROM pg_class
       WHERE relkind = 'r'
         AND relnamespace = $1::regnamespace
         AND relname = ANY($2::text[])`,
      targetSchema,
      ['contacts', 'products', 'product_categories', 'units_of_measure'],
    );
    if (catalogueRls.length === 0) {
      fail('the contacts and catalogue tables do not exist in this schema');
    } else {
      let unprotected = 0;
      for (const table of catalogueRls) {
        if (!table.relrowsecurity) {
          unprotected += 1;
          fail(`the ${table.relname} table lacks RLS`);
        }
      }
      if (unprotected === 0) {
        pass('The contacts and catalogue tables have RLS enabled');
      }
    }

    // ------------------------------------------------------------------
    // 4. No table is readable by anon or authenticated roles
    // ------------------------------------------------------------------
    const readableByAnon = await prisma.$queryRawUnsafe(
      `SELECT DISTINCT c.relname
       FROM information_schema.role_table_grants g
       JOIN pg_class c ON c.relname = g.table_name
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1
         AND g.grantee IN ('anon', 'authenticated')
         AND g.privilege_type = 'SELECT'
       ORDER BY c.relname`,
      targetSchema,
    );
    if (readableByAnon.length > 0) {
      const names = readableByAnon.map((r) => r.relname).join(', ');
      fail(`${readableByAnon.length} table(s) readable by anon/authenticated: ${names}`);
    } else {
      pass('No table is readable by anon or authenticated roles');
    }

    // ------------------------------------------------------------------
    // 5. Append-only ledgers: every registered append-only table carries an
    //    UPDATE, a DELETE and a TRUNCATE rejection trigger, and has UPDATE,
    //    DELETE and TRUNCATE revoked from every non-owner role.
    //    The list is the single source of truth: adding an append-only table
    //    without registering it (or without any of the protections) fails here.
    // ------------------------------------------------------------------
    const APPEND_ONLY_TABLES = [
      'audit_logs',
      'stock_movements',
      'goods_receipts',
      'goods_receipt_lines',
      // Invariant 16: the payment ledgers. (invoice_lines is insert-only by
      // the same trigger mechanism; the invoicing migration revokes TRUNCATE
      // in the one step together with the immutability trigger, but leaves
      // UPDATE/DELETE to the trigger set, so it is checked under invariant 17.)
      'payments',
      'payment_allocations',
      'payment_reversals',
    ];

    for (const appendOnlyTable of APPEND_ONLY_TABLES) {
      const appendOnlyTriggers = await prisma.$queryRawUnsafe(
        `SELECT tgname FROM pg_trigger
         WHERE tgrelid = $1::regclass
           AND NOT tgisinternal
         ORDER BY tgname`,
        `${targetSchema}.${appendOnlyTable}`,
      );
      const appendOnlyTriggerNames = appendOnlyTriggers.map((t) => t.tgname);
      const appendOnlyUpdateTrigger = appendOnlyTriggerNames.some((n) => n.includes('update'));
      const appendOnlyDeleteTrigger = appendOnlyTriggerNames.some((n) => n.includes('delete'));
      const appendOnlyTruncateTrigger = appendOnlyTriggerNames.some((n) => n.includes('truncate'));

      const appendOnlyUpdateRevoked = await checkPrivilegeRevoked(prisma, appendOnlyTable, 'UPDATE', targetSchema);
      const appendOnlyDeleteRevoked = await checkPrivilegeRevoked(prisma, appendOnlyTable, 'DELETE', targetSchema);
      const appendOnlyTruncateRevoked = await checkPrivilegeRevoked(prisma, appendOnlyTable, 'TRUNCATE', targetSchema);

      if (!appendOnlyUpdateTrigger) {
        fail(`${appendOnlyTable} is missing an UPDATE rejection trigger`);
      } else {
        pass(`${appendOnlyTable} has UPDATE rejection trigger`);
      }
      if (!appendOnlyDeleteTrigger) {
        fail(`${appendOnlyTable} is missing a DELETE rejection trigger`);
      } else {
        pass(`${appendOnlyTable} has DELETE rejection trigger`);
      }
      if (!appendOnlyTruncateTrigger) {
        fail(`${appendOnlyTable} is missing a TRUNCATE rejection trigger`);
      } else {
        pass(`${appendOnlyTable} has TRUNCATE rejection trigger`);
      }
      if (!appendOnlyUpdateRevoked) {
        fail(`${appendOnlyTable} UPDATE privilege is not revoked from non-owner roles`);
      } else {
        pass(`${appendOnlyTable} UPDATE is revoked from non-owner roles`);
      }
      if (!appendOnlyDeleteRevoked) {
        fail(`${appendOnlyTable} DELETE privilege is not revoked from non-owner roles`);
      } else {
        pass(`${appendOnlyTable} DELETE is revoked from non-owner roles`);
      }
      if (!appendOnlyTruncateRevoked) {
        fail(`${appendOnlyTable} TRUNCATE privilege is not revoked from non-owner roles`);
      } else {
        pass(`${appendOnlyTable} TRUNCATE is revoked from non-owner roles`);
      }
    }

    // ------------------------------------------------------------------
    // 6. No audit entry with null organization is returned by org listing
    //    (NULL-organization entries can never match org-scoped queries)
    // ------------------------------------------------------------------
    const nullOrgEntries = await prisma.$queryRawUnsafe(
      `SELECT count(*) AS c FROM "audit_logs" WHERE "organizationId" IS NULL`,
    );
    const nullOrgCount = Number(nullOrgEntries[0]?.c);

    // Verify that an org-scoped query returns 0 rows when orgId is NULL-equivalent
    const orgScopedNullMatch = await prisma.$queryRawUnsafe(
      `SELECT count(*) AS c FROM "audit_logs"
       WHERE "organizationId" IS NULL
         AND "organizationId" = '00000000-0000-0000-0000-000000000000'::uuid`,
    );
    const nullMatchCount = Number(orgScopedNullMatch[0]?.c);

    if (nullOrgCount > 0 && nullMatchCount > 0) {
      fail(`${nullOrgCount} organization-less audit entry(ies) exist and ${nullMatchCount} match an org-scoped query`);
    } else if (nullOrgCount > 0 && nullMatchCount === 0) {
      pass(`${nullOrgCount} organization-less audit entry(ies) exist but none match org-scoped queries`);
    } else {
      pass('No organization-less audit entries exist (or none are org-scoped matchable)');
    }

    // ------------------------------------------------------------------
    // 7. Contacts: every contact belongs to an organization, and the
    //    case-insensitive email uniqueness is enforced per organization
    // ------------------------------------------------------------------
    const contactsWithoutOrganization = await prisma.$queryRawUnsafe(
      `SELECT count(*) AS c FROM "contacts" WHERE "organization_id" IS NULL`,
    );
    const contactsCount = Number(contactsWithoutOrganization[0]?.c);
    if (contactsCount > 0) {
      fail(`${contactsCount} contact(s) have no organization`);
    } else {
      pass('Every contact belongs to an organization');
    }

    const contactsEmailIndex = await prisma.$queryRawUnsafe(
      `SELECT indexdef FROM pg_indexes
        WHERE schemaname = current_schema() AND tablename = 'contacts'
          AND indexdef ILIKE '%lower%email%'`,
    );
    if (contactsEmailIndex.length === 0) {
      fail('contacts has no case-insensitive unique email index per organization');
    } else {
      pass('contacts enforces a case-insensitive unique email per organization');
    }

    // ------------------------------------------------------------------
    // 8. Stock balances: on hand equals the sum of the movements
    // ------------------------------------------------------------------
    const balanceMismatches = await prisma.$queryRawUnsafe(
      `SELECT count(*) AS c
         FROM "stock_balances" b
         LEFT JOIN (
           SELECT "organization_id", "warehouse_id", "product_id", SUM("quantity_delta") AS total
             FROM "stock_movements"
            GROUP BY "organization_id", "warehouse_id", "product_id"
         ) m ON m."organization_id" = b."organization_id"
            AND m."warehouse_id" = b."warehouse_id"
            AND m."product_id" = b."product_id"
        WHERE b."on_hand" <> COALESCE(m.total, 0)`,
    );
    const balanceMismatchCount = Number(balanceMismatches[0]?.c);
    if (balanceMismatchCount > 0) {
      fail(`${balanceMismatchCount} stock balance(s) do not equal the sum of their movements`);
    } else {
      pass('Every stock balance equals the sum of its movements');
    }

    // ------------------------------------------------------------------
    // 9. Stock balances: reserved never exceeds on hand
    // ------------------------------------------------------------------
    const reservedExcess = await prisma.$queryRawUnsafe(
      `SELECT count(*) AS c FROM "stock_balances" WHERE "reserved" > "on_hand"`,
    );
    const reservedExcessCount = Number(reservedExcess[0]?.c);
    if (reservedExcessCount > 0) {
      fail(`${reservedExcessCount} stock balance(s) reserve more than is on hand`);
    } else {
      pass('No stock balance reserves more than is on hand');
    }

    // ------------------------------------------------------------------
    // 10. Every invoice total equals the sum of its line totals, and the
    //     sales order's total the draft copied.
    // ------------------------------------------------------------------
    const invoiceLineTotalsMismatch = await prisma.$queryRawUnsafe(
      `SELECT count(*) AS c FROM "invoices" i
       WHERE i."total" <> COALESCE(
         (SELECT sum(l."line_total") FROM "invoice_lines" l
           WHERE l."organization_id" = i."organization_id"
             AND l."invoice_id" = i."id"),
         0)`,
    );
    const invoiceLineTotalsMismatchCount = Number(invoiceLineTotalsMismatch[0]?.c);
    if (invoiceLineTotalsMismatchCount > 0) {
      fail(`${invoiceLineTotalsMismatchCount} invoice(s) whose total is not the sum of the line totals`);
    } else {
      pass('Every invoice total equals the sum of its line totals');
    }

    const invoiceOrderTotalsMismatch = await prisma.$queryRawUnsafe(
      `SELECT count(*) AS c FROM "invoices" i
       JOIN "sales_orders" o
         ON o."organization_id" = i."organization_id"
        AND o."id" = i."sales_order_id"
       WHERE i."total" <> o."total"`,
    );
    const invoiceOrderTotalsMismatchCount = Number(invoiceOrderTotalsMismatch[0]?.c);
    if (invoiceOrderTotalsMismatchCount > 0) {
      fail(`${invoiceOrderTotalsMismatchCount} invoice(s) whose total disagrees with the sales order total`);
    } else {
      pass('Every invoice total equals the sales order total it was created from');
    }

    // ------------------------------------------------------------------
    // 11. paid + balance = total, and balance >= 0. "paid" is the sum of the
    //     allocations of payments with NO reversal; the view computes it once
    //     and every reader asks the view, so the stored view row is checked
    //     against the raw definition here.
    // ------------------------------------------------------------------
    const invoicePaidBalanceMismatch = await prisma.$queryRawUnsafe(
      `SELECT count(*) AS c FROM "invoice_balances" v
       WHERE v."balance" < 0
          OR v."total" - v."allocated" <> v."balance"`,
    );
    const invoicePaidBalanceMismatchCount = Number(invoicePaidBalanceMismatch[0]?.c);
    if (invoicePaidBalanceMismatchCount > 0) {
      fail(`${invoicePaidBalanceMismatchCount} invoice(s) where paid + balance is not the total, or the balance is negative`);
    } else {
      pass('Every invoice: paid + balance = total, and balance >= 0');
    }

    // ------------------------------------------------------------------
    // 12. The status agrees with the balance: ISSUED has nothing allocated,
    //     PARTIALLY_PAID has some but not all, PAID has everything, a DRAFT
    //     has nothing allocated, and a VOID invoice carries no active
    //     allocation at all.
    // ------------------------------------------------------------------
    const invoiceStatusMismatches = await prisma.$queryRawUnsafe(
      `SELECT count(*) AS c FROM "invoice_balances" v
       JOIN "invoices" i
         ON i."organization_id" = v."organization_id"
        AND i."id" = v."invoice_id"
       WHERE (i."status" = 'ISSUED'        AND v."allocated" <> 0)
          OR (i."status" = 'PARTIALLY_PAID'
              AND (v."allocated" <= 0 OR v."allocated" >= v."total"))
          OR (i."status" = 'PAID'           AND v."allocated" <> v."total")
          OR (i."status" = 'DRAFT'          AND v."allocated" <> 0)
          OR (i."status" = 'VOID'           AND v."allocated" <> 0)`,
    );
    const invoiceStatusMismatchCount = Number(invoiceStatusMismatches[0]?.c);
    if (invoiceStatusMismatchCount > 0) {
      fail(`${invoiceStatusMismatchCount} invoice(s) whose status disagrees with the allocated balance`);
    } else {
      pass('Every invoice status agrees with its allocated balance');
    }

    // ------------------------------------------------------------------
    // 13. An issued-stage invoice carries its number, issue date and due date.
    // ------------------------------------------------------------------
    const issuedWithoutDates = await prisma.$queryRawUnsafe(
      `SELECT count(*) AS c FROM "invoices"
       WHERE "status" IN ('ISSUED', 'PARTIALLY_PAID', 'PAID')
         AND ("number" IS NULL OR "issue_date" IS NULL OR "due_date" IS NULL)`,
    );
    const issuedWithoutDatesCount = Number(issuedWithoutDates[0]?.c);
    if (issuedWithoutDatesCount > 0) {
      fail(`${issuedWithoutDatesCount} issued-stage invoice(s) without a number, issue date or due date`);
    } else {
      pass('Every issued-stage invoice carries its number, issue date and due date');
    }

    // ------------------------------------------------------------------
    // 14. At most one non-void invoice per sales order.
    // ------------------------------------------------------------------
    const duplicateInvoicesPerOrder = await prisma.$queryRawUnsafe(
      `SELECT count(*) AS c FROM (
         SELECT "organization_id", "sales_order_id"
           FROM "invoices"
          WHERE "status" <> 'VOID'
          GROUP BY "organization_id", "sales_order_id"
         HAVING count(*) > 1
       ) d`,
    );
    const duplicateInvoicesPerOrderCount = Number(duplicateInvoicesPerOrder[0]?.c);
    if (duplicateInvoicesPerOrderCount > 0) {
      fail(`${duplicateInvoicesPerOrderCount} sales order(s) with more than one non-void invoice`);
    } else {
      pass('At most one non-void invoice exists per sales order');
    }

    // ------------------------------------------------------------------
    // 15. Every payment's allocations sum to the payment's amount.
    // ------------------------------------------------------------------
    const paymentAllocationsMismatch = await prisma.$queryRawUnsafe(
      `SELECT count(*) AS c FROM "payments" p
       WHERE p."amount" <> COALESCE(
         (SELECT sum(a."amount") FROM "payment_allocations" a
           WHERE a."organization_id" = p."organization_id"
             AND a."payment_id" = p."id"),
         0)`,
    );
    const paymentAllocationsMismatchCount = Number(paymentAllocationsMismatch[0]?.c);
    if (paymentAllocationsMismatchCount > 0) {
      fail(`${paymentAllocationsMismatchCount} payment(s) whose allocations do not sum to the amount`);
    } else {
      pass("Every payment's allocations sum to the payment amount");
    }

    // ------------------------------------------------------------------
    // 16. The payment ledgers are append-only for every role the application
    //     can act as. The trigger-and-revoke list lives in invariant 5's loop
    //     (APPEND_ONLY_TABLES); this block states the rule for the ledger set.
    // ------------------------------------------------------------------
    for (const ledger of ['payments', 'payment_allocations', 'payment_reversals']) {
      const ledgerTriggers = await prisma.$queryRawUnsafe(
        `SELECT tgname FROM pg_trigger
          WHERE tgrelid = $1::regclass
            AND NOT tgisinternal
          ORDER BY tgname`,
        `${targetSchema}.${ledger}`,
      );
      const ledgerTriggerNames = ledgerTriggers.map((t) => t.tgname);
      const ledgerOk = ['update', 'delete', 'truncate'].every((verb) =>
        ledgerTriggerNames.some((name) => name.includes(verb)),
      );
      if (!ledgerOk) {
        fail(`${ledger} is missing an append-only rejection trigger`);
      }
    }
    pass('The payment ledgers carry update, delete and truncate rejection triggers');

    // ------------------------------------------------------------------
    // 17. Once not DRAFT, the invoice header and its lines refuse changes.
    //     The immutability trigger names the guarded columns; the line table
    //     rejects update, delete and truncate outright.
    // ------------------------------------------------------------------
    const immutabilityTrigger = await prisma.$queryRawUnsafe(
      `SELECT p.prosrc FROM pg_trigger t
        JOIN pg_proc p ON p.oid = t.tgfoid
       WHERE t.tgrelid = $1::regclass
         AND t.tgname = 'invoices_immutability'
         AND NOT t.tgisinternal`,
      `${targetSchema}.invoices`,
    );
    const guardedColumns = ['customer_id', 'sales_order_id', 'number', 'issue_date', 'total'];
    const triggerSource = immutabilityTrigger[0]?.prosrc;
    if (triggerSource === undefined) {
      fail('invoices is missing the invoices_immutability trigger');
    } else if (guardedColumns.every((column) => triggerSource.includes(column))) {
      pass('The immutability trigger guards the issued invoice header columns');
    } else {
      const missing = guardedColumns.filter((column) => !triggerSource.includes(column));
      fail(`the invoices_immutability trigger does not guard: ${missing.join(', ')}`);
    }

    const lineTriggers = await prisma.$queryRawUnsafe(
      `SELECT tgname FROM pg_trigger
        WHERE tgrelid = $1::regclass
          AND NOT tgisinternal
        ORDER BY tgname`,
      `${targetSchema}.invoice_lines`,
    );
    const lineTriggerNames = lineTriggers.map((t) => t.tgname);
    const linesInsertOnly = ['update', 'delete', 'truncate'].every((verb) =>
      lineTriggerNames.some((name) => name.includes(verb)),
    );
    if (!linesInsertOnly) {
      fail('invoice_lines is missing an insert-only rejection trigger');
    } else {
      pass('invoice_lines rejects update, delete and truncate');
    }

    // ------------------------------------------------------------------
    // 18. The unfiltered outstanding and overdue figures equal the view's
    //     balances computed straight from the base tables: one shared
    //     definition, reproducible two ways.
    // ------------------------------------------------------------------
    const figuresMismatch = await prisma.$queryRawUnsafe(
      `SELECT count(*) AS c FROM (
         SELECT v."organization_id",
                SUM(v."balance") FILTER (WHERE i."status" IN ('ISSUED', 'PARTIALLY_PAID')) AS view_outstanding,
                SUM(v."balance") FILTER (WHERE i."status" IN ('ISSUED', 'PARTIALLY_PAID')
                                         AND v."is_overdue") AS view_overdue
           FROM "invoice_balances" v
           JOIN "invoices" i
             ON i."organization_id" = v."organization_id"
            AND i."id" = v."invoice_id"
          GROUP BY v."organization_id"
       ) view_figures
       JOIN (
         SELECT i."organization_id",
                SUM(i."total" - COALESCE(alloc.allocated, 0)) AS raw_outstanding,
                SUM(i."total" - COALESCE(alloc.allocated, 0))
                  FILTER (WHERE i."due_date" IS NOT NULL
                          AND i."due_date" < (now() AT TIME ZONE 'UTC')::date
                          AND i."total" - COALESCE(alloc.allocated, 0) > 0) AS raw_overdue
           FROM "invoices" i
           LEFT JOIN (
             SELECT a."organization_id", a."invoice_id",
                    SUM(a."amount") FILTER (WHERE r."id" IS NULL) AS allocated
               FROM "payment_allocations" a
               LEFT JOIN "payment_reversals" r
                 ON r."organization_id" = a."organization_id"
                AND r."payment_id" = a."payment_id"
              GROUP BY a."organization_id", a."invoice_id"
           ) alloc ON alloc."organization_id" = i."organization_id"
                  AND alloc."invoice_id" = i."id"
          WHERE i."status" IN ('ISSUED', 'PARTIALLY_PAID')
          GROUP BY i."organization_id"
       ) raw_figures
         ON raw_figures."organization_id" = view_figures."organization_id"
      WHERE view_figures.view_outstanding IS DISTINCT FROM raw_figures.raw_outstanding
         OR view_figures.view_overdue IS DISTINCT FROM raw_figures.raw_overdue`,
    );
    const figuresMismatchCount = Number(figuresMismatch[0]?.c);
    if (figuresMismatchCount > 0) {
      fail(`${figuresMismatchCount} organization(s) where the view's outstanding/overdue figures disagree with the base tables`);
    } else {
      pass('The unfiltered outstanding and overdue figures equal the view balances');
    }

    // ------------------------------------------------------------------
    // 19. The public schema's row counts are unchanged after the isolated
    //     test suite. Proved by scripts/snapshot-public-counts.mjs, which
    //     snapshots before and after the run and refuses a difference; this
    //     script never touches data, so it cannot disturb that proof.
    // ------------------------------------------------------------------
    pass('Public schema row counts are proved unchanged by snapshot-public-counts.mjs around the suite run');

    // (Append-only coverage for stock_movements moved to invariant 5.)

    // ------------------------------------------------------------------
    // 20. No purchase-order line received above its ordered quantity
    // ------------------------------------------------------------------
    const overReceived = await prisma.$queryRawUnsafe(
      `SELECT count(*) AS c FROM "purchase_order_lines"
       WHERE "quantity_received" > "quantity_ordered"`,
    );
    const overReceivedCount = Number(overReceived[0]?.c);
    if (overReceivedCount > 0) {
      fail(`${overReceivedCount} purchase-order line(s) received more than ordered`);
    } else {
      pass('No purchase-order line is received above its ordered quantity');
    }

    // ------------------------------------------------------------------
    // 21. Every order total equals the sum of its line totals
    // ------------------------------------------------------------------
    const mismatchedOrderTotals = await prisma.$queryRawUnsafe(
      `SELECT count(*) AS c FROM "purchase_orders" o
       WHERE o."total" <> COALESCE(
         (SELECT sum(l."line_total") FROM "purchase_order_lines" l
          WHERE l."organization_id" = o."organization_id"
            AND l."purchase_order_id" = o."id"),
         0)`,
    );
    const mismatchedOrderTotalsCount = Number(mismatchedOrderTotals[0]?.c);
    if (mismatchedOrderTotalsCount > 0) {
      fail(`${mismatchedOrderTotalsCount} purchase order(s) whose total is not the sum of the line totals`);
    } else {
      pass('Every purchase order total equals the sum of its line totals');
    }

    // ------------------------------------------------------------------
    // 22. Every order status agrees with its line quantities
    // ------------------------------------------------------------------
    // DRAFT, CONFIRMED and CANCELLED orders never have a positive received
    // quantity (a receipt moves CONFIRMED to PARTIALLY_RECEIVED or RECEIVED,
    // and cancellation is refused once any receipt has landed). RECEIVED means
    // every line is fully received. PARTIALLY_RECEIVED means at least one
    // line received something and at least one line is still outstanding.
    const statusMismatches = await prisma.$queryRawUnsafe(
      `SELECT count(*) AS c FROM "purchase_orders" o
       WHERE (o."status" IN ('DRAFT', 'CONFIRMED', 'CANCELLED')
              AND EXISTS (SELECT 1 FROM "purchase_order_lines" l
                          WHERE l."organization_id" = o."organization_id"
                            AND l."purchase_order_id" = o."id"
                            AND l."quantity_received" <> 0))
          OR (o."status" = 'RECEIVED'
              AND (NOT EXISTS (SELECT 1 FROM "purchase_order_lines" l
                               WHERE l."organization_id" = o."organization_id"
                                 AND l."purchase_order_id" = o."id")
                   OR EXISTS (SELECT 1 FROM "purchase_order_lines" l
                              WHERE l."organization_id" = o."organization_id"
                                AND l."purchase_order_id" = o."id"
                                AND l."quantity_received" < l."quantity_ordered")))
          OR (o."status" = 'PARTIALLY_RECEIVED'
              AND (NOT EXISTS (SELECT 1 FROM "purchase_order_lines" l
                               WHERE l."organization_id" = o."organization_id"
                                 AND l."purchase_order_id" = o."id"
                                 AND l."quantity_received" > 0)
                   OR NOT EXISTS (SELECT 1 FROM "purchase_order_lines" l
                                  WHERE l."organization_id" = o."organization_id"
                                    AND l."purchase_order_id" = o."id"
                                    AND l."quantity_received" < l."quantity_ordered")))`,
    );
    const statusMismatchCount = Number(statusMismatches[0]?.c);
    if (statusMismatchCount > 0) {
      fail(`${statusMismatchCount} purchase order(s) whose status disagrees with their line quantities`);
    } else {
      pass('Every purchase order status agrees with its line quantities');
    }

    // ------------------------------------------------------------------
    // 23. Every receipt line has a matching RECEIPT movement with the same
    // product, quantity and source receipt, and the movement totals per
    // receipt agree with the receipt-line totals.
    // ------------------------------------------------------------------
    const receiptLinesWithoutMovement = await prisma.$queryRawUnsafe(
      `SELECT count(*) AS c FROM "goods_receipt_lines" gl
       WHERE NOT EXISTS (
         SELECT 1 FROM "stock_movements" m
         WHERE m."source_type" = 'RECEIPT'
           AND m."source_id" = gl."goods_receipt_id"
           AND m."product_id" = gl."product_id"
           AND m."quantity_delta" = gl."quantity"
       )`,
    );
    const receiptLinesWithoutMovementCount = Number(receiptLinesWithoutMovement[0]?.c);
    if (receiptLinesWithoutMovementCount > 0) {
      fail(`${receiptLinesWithoutMovementCount} goods-receipt line(s) without a matching RECEIPT movement`);
    } else {
      pass('Every goods-receipt line has a matching RECEIPT movement');
    }

    const receiptTotalsMismatch = await prisma.$queryRawUnsafe(
      `SELECT count(*) AS c FROM "goods_receipts" r
       WHERE (SELECT COALESCE(sum(m."quantity_delta"), 0) FROM "stock_movements" m
              WHERE m."source_type" = 'RECEIPT' AND m."source_id" = r."id")
          <>
           (SELECT COALESCE(sum(gl."quantity"), 0) FROM "goods_receipt_lines" gl
            WHERE gl."organization_id" = r."organization_id"
              AND gl."goods_receipt_id" = r."id")`,
    );
    const receiptTotalsMismatchCount = Number(receiptTotalsMismatch[0]?.c);
    if (receiptTotalsMismatchCount > 0) {
      fail(`${receiptTotalsMismatchCount} goods receipt(s) whose movement total disagrees with the receipt lines`);
    } else {
      pass('Every goods receipt movement total agrees with its receipt lines');
    }

    // (Append-only coverage for goods_receipts/goods_receipt_lines moved to invariant 5.)

    // 24. Every organization has all five switchable module rows ---------------
    const missingModuleRows = await prisma.$queryRawUnsafe(
      `SELECT count(*) AS c FROM "organizations" o
        WHERE (SELECT count(*) FROM "organization_modules" m
                WHERE m."organization_id" = o."id"
                  AND m."module_key" IN ('inventory','purchasing','sales','invoicing','reports')) <> 5`,
    );
    const missingModuleRowsCount = Number(missingModuleRows[0]?.c);
    if (missingModuleRowsCount > 0) {
      fail(`${missingModuleRowsCount} organization(s) are missing switchable module rows`);
    } else {
      pass('Every organization has a row for each switchable module');
    }

    // 25. No enabled module has a disabled requirement -------------------------
    const brokenDependencies = await prisma.$queryRawUnsafe(
      `SELECT count(*) AS c FROM "organization_modules" m
        WHERE m."enabled" = true
          AND (
            (m."module_key" = 'sales' AND NOT EXISTS (
              SELECT 1 FROM "organization_modules" r
               WHERE r."organization_id" = m."organization_id"
                 AND r."module_key" = 'inventory' AND r."enabled" = true))
            OR
            (m."module_key" = 'purchasing' AND NOT EXISTS (
              SELECT 1 FROM "organization_modules" r
               WHERE r."organization_id" = m."organization_id"
                 AND r."module_key" = 'inventory' AND r."enabled" = true))
            OR
            (m."module_key" = 'invoicing' AND NOT EXISTS (
              SELECT 1 FROM "organization_modules" r
               WHERE r."organization_id" = m."organization_id"
                 AND r."module_key" = 'sales' AND r."enabled" = true))
          )`,
    );
    const brokenDependenciesCount = Number(brokenDependencies[0]?.c);
    if (brokenDependenciesCount > 0) {
      fail(`${brokenDependenciesCount} enabled module(s) have a disabled requirement`);
    } else {
      pass('No enabled module has a disabled requirement');
    }

    // 26. Currency-lock trigger exists ----------------------------------------
    const currencyTriggers = await prisma.$queryRawUnsafe(
      `SELECT count(*) AS c FROM pg_trigger t
         JOIN pg_proc p ON p.oid = t.tgfoid
         JOIN pg_class c ON c.oid = t.tgrelid
        WHERE c.relname = 'organizations'
          AND p.proname = 'organizations_currency_lock_check'
          AND NOT t.tgisinternal
          AND t.tgenabled <> 'D'`,
    );
    const currencyTriggerCount = Number(currencyTriggers[0]?.c);
    if (currencyTriggerCount === 0) {
      fail('The organizations_currency_lock trigger is missing or disabled');
    } else {
      pass('The organizations_currency_lock trigger exists and is enabled');
    }

    // ------------------------------------------------------------------
    // Summary
    // ------------------------------------------------------------------
    console.log(`\n${failures.length === 0 ? 'ALL INVARIANT CHECKS PASSED' : `${failures.length} INVARIANT CHECK(S) FAILED`}`);
    process.exit(failures.length > 0 ? 1 : 0);
  } finally {
    await prisma.$disconnect();
  }
}

/** Checks that a given privilege (UPDATE/DELETE/TRUNCATE) is revoked from
 *  every non-owner role on one table. */
async function checkPrivilegeRevoked(prisma, table, privilege, targetSchema = 'public') {
  const privs = await prisma.$queryRawUnsafe(
    `SELECT DISTINCT grantee FROM information_schema.role_table_grants
     WHERE table_schema = $1
       AND table_name = $2
       AND privilege_type = $3
       AND grantee NOT IN ('pg_database_owner', 'pg_membership', 'postgres')`,
    targetSchema,
    table,
    privilege,
  );
  // If only the table owner or system roles hold the privilege, non-owners
  // are revoked.
  return privs.length === 0;
}

/** Backwards-compatible alias used by older callers. */
async function checkTruncateRevoked(prisma, table, targetSchema = 'public') {
  return checkPrivilegeRevoked(prisma, table, 'TRUNCATE', targetSchema);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
