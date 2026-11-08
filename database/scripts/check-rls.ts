#!/usr/bin/env node
/**
 * RLS guard (defence in depth).
 *
 * Every table in the public schema must have ROW LEVEL SECURITY enabled, with no
 * policies (the app connects as postgres, which bypasses RLS; the Supabase API roles
 * then see nothing because no policies exist).
 *
 * This guard scans every migration SQL file in `database/prisma/migrations/` and
 * fails when any migration creates a table without enabling RLS on it. A migration
 * that creates a table must also contain `ALTER TABLE <table> ENABLE ROW LEVEL
 * SECURITY` for that table.
 *
 * Exit codes: 0 all tables have RLS, 1 a table is missing RLS, 2 the migrations
 * directory could not be read.
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
    // Group 2 is the table name when schema-qualified, group 1 otherwise.
    tables.push(match[2] ?? match[1] ?? '');
  }
  return tables;
}

function main(): number {
  const folders = listMigrationFolders();
  if (folders.length === 0) {
    console.error('check:rls: no migration folders found in database/prisma/migrations');
    return 2;
  }

  // Read all migration SQL files and collect created tables and RLS-enabled tables.
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

  if (problems.length > 0) {
    console.error(
      `check:rls: ${problems.length} table(s) created without ROW LEVEL SECURITY:`,
    );
    for (const problem of problems) {
      console.error(`  [${problem.migration}] table "${problem.table}" created without ENABLE ROW LEVEL SECURITY`);
    }
    console.error(
      '\nEvery CREATE TABLE in a migration must be paired with ALTER TABLE <table> ENABLE ROW LEVEL SECURITY. ' +
        'RLS is defence in depth: the app connects as postgres (bypasses RLS), and Supabase API roles see nothing ' +
        'until policies are explicitly granted.',
    );
    return 1;
  }

  console.log(
    `check:rls: all ${allCreated.length} table(s) created in migrations have ROW LEVEL SECURITY enabled.`,
  );
  return 0;
}

const invokedDirectly =
  typeof process.argv[1] === 'string' &&
  process.argv[1].endsWith('check-rls.ts');

if (invokedDirectly) {
  process.exit(main());
}

export { main, createdTables, rlsEnabledTables };
