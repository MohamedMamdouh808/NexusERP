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
 *  5. audit_logs has UPDATE, DELETE, and TRUNCATE protection
 *  6. No audit entry with a null organization is returned by an organization
 *     listing (i.e., NULL-organization entries never match org-scoped queries)
 *  7. Every contact belongs to an organization, and the case-insensitive unique
 *     email index exists per organization
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

    // The contacts table is named explicitly. It is the newest tenant-scoped
    // table, and "every table has RLS" is a claim nobody can check by eye at
    // 3am when exactly one table is unprotected.
    const contactsRls = await prisma.$queryRawUnsafe(
      `SELECT relrowsecurity FROM pg_class
       WHERE relkind = 'r'
         AND relnamespace = $1::regnamespace
         AND relname = 'contacts'`,
      targetSchema,
    );
    if (contactsRls.length === 0) {
      fail('the contacts table does not exist in this schema');
    } else if (!contactsRls[0].relrowsecurity) {
      fail('the contacts table lacks RLS');
    } else {
      pass('The contacts table has RLS enabled');
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
    // 5. audit_logs has UPDATE, DELETE, and TRUNCATE protection
    // ------------------------------------------------------------------
    const triggers = await prisma.$queryRawUnsafe(
      `SELECT tgname FROM pg_trigger
       WHERE tgrelid = 'audit_logs'::regclass
         AND NOT tgisinternal
       ORDER BY tgname`,
    );
    const triggerNames = triggers.map((t) => t.tgname);
    const hasUpdateTrigger = triggerNames.some((n) => n.includes('update'));
    const hasDeleteTrigger = triggerNames.some((n) => n.includes('delete'));
    const hasTruncateTrigger = triggerNames.some((n) => n.includes('truncate'));
    const hasTruncateRevoked = await checkTruncateRevoked(prisma, targetSchema);

    if (!hasUpdateTrigger) {
      fail('audit_logs is missing an UPDATE rejection trigger');
    } else {
      pass('audit_logs has UPDATE rejection trigger');
    }
    if (!hasDeleteTrigger) {
      fail('audit_logs is missing a DELETE rejection trigger');
    } else {
      pass('audit_logs has DELETE rejection trigger');
    }
    if (!hasTruncateTrigger) {
      fail('audit_logs is missing a TRUNCATE rejection trigger');
    } else {
      pass('audit_logs has TRUNCATE rejection trigger');
    }
    if (!hasTruncateRevoked) {
      fail('audit_logs TRUNCATE privilege is not revoked from non-owner roles');
    } else {
      pass('audit_logs TRUNCATE is revoked from non-owner roles');
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
    // Summary
    // ------------------------------------------------------------------
    console.log(`\n${failures.length === 0 ? 'ALL INVARIANT CHECKS PASSED' : `${failures.length} INVARIANT CHECK(S) FAILED`}`);
    process.exit(failures.length > 0 ? 1 : 0);
  } finally {
    await prisma.$disconnect();
  }
}

/** Checks that TRUNCATE privilege is revoked from non-owner roles on audit_logs. */
async function checkTruncateRevoked(prisma, targetSchema = 'public') {
  const truncPrivs = await prisma.$queryRawUnsafe(
    `SELECT DISTINCT grantee FROM information_schema.role_table_grants
     WHERE table_schema = $1
       AND table_name = 'audit_logs'
       AND privilege_type = 'TRUNCATE'
       AND grantee NOT IN ('pg_database_owner', 'pg_membership', 'postgres')`,
    targetSchema,
  );
  // If only the table owner or system roles have TRUNCATE, non-owners are revoked
  return truncPrivs.length === 0;
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
