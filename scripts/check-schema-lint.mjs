#!/usr/bin/env node
/**
 * check-schema-lint.mjs
 *
 * The security lint, run inside the database.
 *
 * Supabase's hosted linter is a dashboard feature; the warnings it reports are
 * all decidable from the catalog, so this script decides them here and can run
 * in CI against the isolated test schema and by hand against the hosted public
 * schema.
 *
 * The warning classes checked (the Supabase advisor's names):
 *   - rls_disabled              a table without row level security
 *   - policy_exists_rls_disabled a policy on a table whose RLS is off
 *   - multiple_permissive_policies two PERMISSIVE policies for one role/command
 *   - function_search_path_mutable a function whose search_path is not pinned
 *   - security_definer_view      a view running as its definer
 *   - duplicate_index            two indexes with the same definition
 *   - unindexed_foreign_keys     a foreign key with no supporting index
 *
 * Read-only: it only reads the catalog. It never prints DATABASE_URL or a
 * password - the schema is printed by NAME.
 *
 * Usage:
 *   node scripts/check-schema-lint.mjs                    # the schema the URL names
 *   node scripts/with-test-schema-env.mjs node scripts/check-schema-lint.mjs
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

const warnings = [];

function warn(kind, subject, detail) {
  warnings.push({ kind, subject, detail });
  console.log(`WARN  ${kind}: ${subject}${detail ? ` - ${detail}` : ''}`);
}

async function main() {
  const databaseUrl = loadDatabaseUrl();
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  try {
    const schemaRow = await prisma.$queryRawUnsafe(`SELECT current_schema()::text AS s`);
    const schema = schemaRow[0]?.s ?? 'public';
    console.log(`Linting the schema "${schema}"\n`);

    // rls_disabled
    // `_prisma_migrations` is the migration bookkeeping table: Prisma owns it,
    // the application never reads it, and the repository's own invariant check
    // documents it as the one exception.
    const tables = await prisma.$queryRawUnsafe(
      `SELECT c.relname AS name, c.relrowsecurity AS rls
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'
        ORDER BY c.relname`,
      schema,
    );
    for (const table of tables) {
      if (!table.rls) {
        warn('rls_disabled', `${schema}.${table.name}`, 'row level security is not enabled');
      }
    }

    // policy_exists_rls_disabled
    const policiesOnOpenTables = await prisma.$queryRawUnsafe(
      `SELECT p.tablename AS name
         FROM pg_policies p
         JOIN pg_class c ON c.relname = p.tablename
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND NOT c.relrowsecurity
        ORDER BY p.tablename`,
      schema,
    );
    for (const policy of policiesOnOpenTables) {
      warn('policy_exists_rls_disabled', `${schema}.${policy.name}`, 'a policy exists but RLS is off');
    }

    // multiple_permissive_policies
    const permissive = await prisma.$queryRawUnsafe(
      `SELECT tablename, policyname, roles, cmd, permissive
         FROM pg_policies
        WHERE schemaname = $1 AND permissive = 'PERMISSIVE'
        ORDER BY tablename, cmd, policyname`,
      schema,
    );
    const grouped = new Map();
    for (const policy of permissive) {
      const key = `${policy.tablename}|${policy.cmd}|${policy.roles}`;
      const list = grouped.get(key) ?? [];
      list.push(policy.policyname);
      grouped.set(key, list);
    }
    for (const [key, names] of grouped) {
      if (names.length > 1) {
        const [tablename, cmd, roles] = key.split('|');
        warn(
          'multiple_permissive_policies',
          `${schema}.${tablename}`,
          `${names.length} PERMISSIVE policies for ${cmd} / ${roles}: ${names.join(', ')}`,
        );
      }
    }

    // function_search_path_mutable
    const functions = await prisma.$queryRawUnsafe(
      `SELECT p.proname AS name, p.prosecdef AS security_definer,
              COALESCE(array_to_string(p.proconfig, ','), '') AS config
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = $1
        ORDER BY p.proname`,
      schema,
    );
    for (const fn of functions) {
      const pinned = fn.config.includes('search_path');
      if (!pinned) {
        warn(
          'function_search_path_mutable',
          `${schema}.${fn.name}`,
          'the function does not pin its search_path',
        );
      }
    }

    // security_definer_view
    const definerViews = await prisma.$queryRawUnsafe(
      `SELECT c.relname AS name
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relkind = 'v' AND c.reloptions IS NOT NULL
          AND 'security_definer=true' = ANY(c.reloptions)
        ORDER BY c.relname`,
      schema,
    );
    for (const view of definerViews) {
      warn('security_definer_view', `${schema}.${view.name}`, 'the view runs as its definer');
    }

    // duplicate_index
    const duplicates = await prisma.$queryRawUnsafe(
      `SELECT tablename, indexdef, count(*)::int AS copies
         FROM pg_indexes
        WHERE schemaname = $1
        GROUP BY tablename, indexdef
       HAVING count(*) > 1
        ORDER BY tablename`,
      schema,
    );
    for (const duplicate of duplicates) {
      warn(
        'duplicate_index',
        `${schema}.${duplicate.tablename}`,
        `${duplicate.copies} indexes share one definition`,
      );
    }

    // unindexed_foreign_keys
    // An index supports a foreign key when its LEADING columns are the key's
    // columns, in the key's order: the index (a, b) serves a foreign key on
    // (a), and the index (a, b) serves a foreign key on (a, b), but not one on
    // (b, a).
    const unindexed = await prisma.$queryRawUnsafe(
      `SELECT c.relname AS table_name, con.conname AS fk,
              (SELECT string_agg(a.attname, ',' ORDER BY k.ord)
                 FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
                 JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum) AS columns
         FROM pg_constraint con
         JOIN pg_class c ON c.oid = con.conrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE con.contype = 'f'
          AND n.nspname = $1
          AND NOT EXISTS (
                SELECT 1 FROM pg_index i
                 WHERE i.indrelid = con.conrelid
                   AND (i.indkey::smallint[])[0:array_length(con.conkey, 1) - 1] = con.conkey
              )
        ORDER BY c.relname, con.conname`,
      schema,
    );
    for (const foreignKey of unindexed) {
      warn(
        'unindexed_foreign_keys',
        `${schema}.${foreignKey.table_name}`,
        `the foreign key ${foreignKey.fk} (${foreignKey.columns}) has no supporting index`,
      );
    }

    console.log(
      `\n${warnings.length === 0 ? 'NO LINT WARNINGS' : `${warnings.length} LINT WARNING(S)`}`,
    );
    process.exit(warnings.length > 0 ? 1 : 0);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('FATAL:', error.message);
  process.exit(1);
});
