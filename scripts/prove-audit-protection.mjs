#!/usr/bin/env node
/**
 * prove-audit-protection.mjs
 *
 * Proves that `audit_logs` is append-only: UPDATE, DELETE and TRUNCATE are
 * all rejected, and the rejection survives even a granted TRUNCATE privilege.
 *
 * The schema is the one the URL names - the isolated `nexuserp_test` schema in
 * CI and by hand. Nothing here is written to `public`: the proof inserts one
 * row into the schema it was pointed at and the append-only rules then refuse
 * to let it be changed or removed.
 *
 * The URL is never printed: it carries the password.
 *
 * Usage:
 *   node scripts/with-test-schema-env.mjs node scripts/prove-audit-protection.mjs
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'node:fs';

let url = process.env.DATABASE_URL;
if (!url && existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    if (line.startsWith('DATABASE_URL=')) {
      url = line.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, '');
      break;
    }
  }
}

if (!url) {
  console.error('prove-audit-protection: DATABASE_URL is not set.');
  process.exit(2);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  const schemaRow = await prisma.$queryRawUnsafe(`SELECT current_schema()::text AS s`);
  const schema = schemaRow[0]?.s ?? 'public';
  console.log(`--- Proving audit_logs protection in the schema "${schema}" ---\n`);

  // The proof row. It is inserted and never removed: the append-only rules
  // refuse to let it be changed or deleted, which is the point.
  const testId = (
    await prisma.$queryRawUnsafe(`
      INSERT INTO "audit_logs" (
        "id", "action", "recordType", "createdAt"
      ) VALUES (
        gen_random_uuid(), 'test.protection_proof', 'test', now()
      ) RETURNING id
    `)
  )[0].id;
  console.log('Inserted proof test row with id:', testId);

  // 1. Prove UPDATE is rejected
  let updateRejected = false;
  try {
    await prisma.$executeRawUnsafe(
      `
      UPDATE "audit_logs"
      SET "action" = 'hacked'
      WHERE "id" = $1::uuid
    `,
      testId,
    );
  } catch (err) {
    updateRejected = true;
    console.log('PASS: UPDATE was rejected as expected:');
    console.log('  Error message:', err.message.trim());
  }
  if (!updateRejected) {
    throw new Error('FAIL: UPDATE was not rejected!');
  }

  // 2. Prove DELETE is rejected
  let deleteRejected = false;
  try {
    await prisma.$executeRawUnsafe(
      `
      DELETE FROM "audit_logs"
      WHERE "id" = $1::uuid
    `,
      testId,
    );
  } catch (err) {
    deleteRejected = true;
    console.log('\nPASS: DELETE was rejected as expected:');
    console.log('  Error message:', err.message.trim());
  }
  if (!deleteRejected) {
    throw new Error('FAIL: DELETE was not rejected!');
  }

  // 3. Prove TRUNCATE is rejected
  let truncateRejected = false;
  try {
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE "audit_logs"
    `);
  } catch (err) {
    truncateRejected = true;
    console.log('\nPASS: TRUNCATE was rejected as expected:');
    console.log('  Error message:', err.message.trim());
  }
  if (!truncateRejected) {
    throw new Error('FAIL: TRUNCATE was not rejected!');
  }

  // 3b. Prove that even if TRUNCATE is granted to postgres, the trigger rejects it
  let triggerTruncateRejected = false;
  try {
    await prisma.$executeRawUnsafe(`GRANT TRUNCATE ON TABLE "audit_logs" TO postgres`);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "audit_logs"`);
  } catch (err) {
    triggerTruncateRejected = true;
    console.log('\nPASS: TRUNCATE (with privilege granted) was rejected by trigger:');
    console.log('  Error message:', err.message.trim());
  } finally {
    // Revoke again to keep privileges revoked
    await prisma.$executeRawUnsafe(`REVOKE TRUNCATE ON TABLE "audit_logs" FROM postgres`);
  }
  if (!triggerTruncateRejected) {
    throw new Error('FAIL: TRUNCATE trigger did not reject truncation!');
  }

  // 4. Verify the trigger functions of THIS schema pin their search_path
  const funcs = await prisma.$queryRawUnsafe(
    `
    SELECT proname, proconfig
    FROM pg_proc
    JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
    WHERE nspname = $1 AND proname IN ('audit_logs_reject_update', 'audit_logs_reject_delete', 'audit_logs_reject_truncate')
    ORDER BY proname
  `,
    schema,
  );
  console.log('\nVerifying functions have search_path set:');
  if (funcs.length === 0) {
    throw new Error(`FAIL: the schema "${schema}" has no append-only trigger functions!`);
  }
  for (const f of funcs) {
    console.log(`  Function ${f.proname}: proconfig = ${JSON.stringify(f.proconfig)}`);
    if (!f.proconfig || !f.proconfig.some((c) => c.startsWith('search_path='))) {
      throw new Error(`FAIL: Function ${f.proname} does not have search_path set!`);
    }
  }

  console.log('\nALL PROOFS PASSED: UPDATE, DELETE, and TRUNCATE are definitively rejected.');
}

main()
  .catch((e) => {
    console.error('FAILED:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
