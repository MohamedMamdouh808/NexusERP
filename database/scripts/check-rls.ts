#!/usr/bin/env node
/**
 * RLS guard (defence in depth).
 *
 * Every table in the public schema must have ROW LEVEL SECURITY enabled, with no
 * policies (the app connects as postgres, which bypasses RLS; the Supabase API roles
 * then see nothing because no policies exist).
 *
 * This guard does TWO checks:
 *  1. Scans every migration SQL file and fails when a migration creates a table
 *     without also enabling RLS on it (catches migration-authoring mistakes).
 *  2. Queries the database (when DATABASE_URL is set) and fails when any table
 *     lacks RLS (catches drift between migration files and the applied database).
 *
 * Exit codes: 0 all tables have RLS, 1 a table is missing RLS, 2 the migrations
 * directory could not be read or the database could not be queried.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(__dirname, '..', '..');
const migrationsDir = join(repoRoot, 'database', 'prisma', 'migrations');

/** Migration folder names (directories only), sorted. */
function listMigrationFolders(): string[] {
  if (!existsSync(migrationsDir)) return [];
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Extract table names from CREATE TABLE statements in a migration file. */
function createdTables(sql: string): string[] {
  const tables: string[] = [];
  const pattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["']?(\w+)["']?\s*\(/gi;
  let match;
  while ((match = pattern.exec(sql)) !== null) {
    tables.push(match[1]!);
  }
  return tables;
}

/** Extract table names from ALTER TABLE ... ENABLE ROW LEVEL SECURITY statements. */
function rlsEnabledTables(sql: string): string[] {
  const tables: string[] = [];
  const pattern = /ALTER\s+TABLE\s+(?:["']?(\w+)["']?\s*"."\s*)?["']?(\w+)["']?\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
  let match;
  while ((match = pattern.exec(sql)) !== null) {
    tables.push(match[2] ?? match[1] ?? '');
  }
  return tables;
}

/** Queries the database for tables that lack RLS. Returns table names. */
async function tablesWithoutRls(databaseUrl: string): Promise<string[]> {
  const { PrismaClient } = (await import('@prisma/client')) as unknown as {
    PrismaClient: new (options: { datasources: { db: { url: string } } }) => {
      $queryRawUnsafe: (sql: string) => Promise<{ relname: string }[]>;
      $disconnect: () => Promise<void>;
    };
  };

  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const rows = await client.$queryRawUnsafe(`
      SELECT relname
      FROM pg_class
      WHERE relkind = 'r'
        AND relnamespace = 'public'::regnamespace
        AND relname <> '_prisma_migrations'
        AND NOT relrowsecurity
      ORDER BY relname
    `);
    return rows.map((r) => r.relname);
  } finally {
    await client.$disconnect();
  }
}

async function main(): Promise<number> {
  const folders = listMigrationFolders();
  if (folders.length === 0) {
    console.error('check:rls: no migration folders found in database/prisma/migrations');
    return 2;
  }

  // Check 1: migration files - every CREATE TABLE must have ENABLE ROW LEVEL SECURITY
  const allCreated: { migration: string; table: string }[] = [];
  const allRlsEnabled: { migration: string; table: string }[] = [];

  for (const folder of folders) {
    const migrationSqlPath = join(migrationsDir, folder, 'migration.sql');
    if (!existsSync(migrationSqlPath)) continue;

    let sql: string;
    try {
      sql = readFileSync(migrationSqlPath, 'utf8');
    } catch (error) {
      console.error(
        `check:rls: cannot read ${migrationSqlPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 2;
    }

    for (const table of createdTables(sql)) {
      allCreated.push({ migration: folder, table });
    }
    for (const table of rlsEnabledTables(sql)) {
      allRlsEnabled.push({ migration: folder, table });
    }
  }

  const rlsEnabledSet = new Set(allRlsEnabled.map((entry) => entry.table));
  const problems: { migration: string; table: string }[] = [];

  for (const entry of allCreated) {
    if (!rlsEnabledSet.has(entry.table)) {
      problems.push(entry);
    }
  }

  // Check 2: database state - every table must have RLS enabled
  let dbProblems: string[] = [];
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    try {
      dbProblems = await tablesWithoutRls(databaseUrl);
    } catch (error) {
      console.error(
        `check:rls: could not query database for RLS state: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 2;
    }
  }

  if (problems.length > 0 || dbProblems.length > 0) {
    console.error(
      `check:rls: ${problems.length + dbProblems.length} table(s) without ROW LEVEL SECURITY:`,
    );
    for (const problem of problems) {
      console.error(`  [${problem.migration}] table "${problem.table}" created without ENABLE ROW LEVEL SECURITY`);
    }
    for (const table of dbProblems) {
      console.error(`  [database] table "${table}" exists without ROW LEVEL SECURITY`);
    }
    console.error(
      '\nEvery table in the public schema must have ROW LEVEL SECURITY enabled. ' +
        'RLS is defence in depth: the app connects as postgres (bypasses RLS), and Supabase API roles see nothing ' +
        'until policies are explicitly granted.',
    );
    return 1;
  }

  console.log(
    `check:rls: all ${allCreated.length} table(s) created in migrations have ROW LEVEL SECURITY enabled.`,
  );
  if (databaseUrl) {
    console.log(
      `check:rls: all tables in the database have ROW LEVEL SECURITY enabled.`,
    );
  }
  return 0;
}

const invokedDirectly =
  typeof process.argv[1] === 'string' &&
  process.argv[1].endsWith('check-rls.ts');

if (invokedDirectly) {
  main().then((code) => process.exit(code));
}

export { main, createdTables, rlsEnabledTables, tablesWithoutRls };
