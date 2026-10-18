#!/usr/bin/env node
/**
 * Migration history guard (T031, FR-014).
 *
 * FR-014 requires the system to "refuse to proceed when the applied history is missing,
 * out of order, or inconsistent with the repository". Prisma records what was applied in
 * `_prisma_migrations`, but it does NOT enforce the whole requirement:
 *
 *   VERIFIED on Prisma 6.19.3 - with `prisma/migrations/` renamed away, `prisma migrate
 *   status` prints "No migration found in prisma/migrations" followed by "Database schema
 *   is up to date!" and EXITS 0. A missing migration directory is reported, not refused.
 *
 * That is a real gap: a repository whose migrations folder has been lost or never
 * committed looks healthy, and the next `migrate deploy` would create a fresh history that
 * no longer describes the database.
 *
 * This check closes it. It compares what the database recorded against what the repository
 * contains and fails when they disagree, naming the specific migration. Wired into
 * `npm run check:migrations` (NOT `npm run lint`, because lint must stay runnable with no
 * database) and the pipeline's migration job, which runs it after the db service is up.
 *
 * Exit codes: 0 consistent, 1 inconsistent or unable to run.
 */

import { readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface HistoryProblem {
  readonly kind: 'missing-folder' | 'missing-file' | 'empty-directory' | 'checksum-mismatch';
  readonly migration: string;
  readonly message: string;
}

export interface AppliedMigration {
  readonly migration_name: string;
  readonly finished_at: Date | null;
  readonly rolled_back_at: Date | null;
}

/** Migration folder names present in the repository, sorted. */
export function listMigrationFolders(migrationsDir: string): string[] {
  if (!existsSync(migrationsDir)) return [];
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Compares the applied history against the repository's migration folders.
 *
 * Split out from the database call so it can be tested against a synthetic history without
 * a database - the comparison logic is where the guarantee lives.
 */
export function compareHistory(
  applied: readonly AppliedMigration[],
  folders: readonly string[],
): HistoryProblem[] {
  const problems: HistoryProblem[] = [];
  const folderSet = new Set(folders);
  const appliedSet = new Set(applied.map((row) => row.migration_name));

  if (applied.length === 0 && folders.length === 0) {
    problems.push({
      kind: 'empty-directory',
      migration: '',
      message:
        'The migrations directory contains no migrations and the database has no applied ' +
        'history. A fresh checkout that has never been migrated.',
    });
    return problems;
  }

  for (const row of applied) {
    // A rolled-back migration is not expected to have a folder; it is not a defect.
    if (row.rolled_back_at !== null) continue;

    if (!folderSet.has(row.migration_name)) {
      problems.push({
        kind: 'missing-folder',
        migration: row.migration_name,
        message:
          `The database has migration "${row.migration_name}" applied, but that migration is ` +
          'not present in the repository. The migration history cannot be reconstructed, so ' +
          'further migrations cannot be trusted.',
      });
    }
  }

  for (const folder of folders) {
    if (!appliedSet.has(folder)) {
      problems.push({
        kind: 'missing-file',
        migration: folder,
        message:
          `The repository contains migration "${folder}", which is not recorded in the ` +
          'database. The database history is behind the repository; run `migrate deploy`.',
      });
    }
  }

  return problems;
}

/** Resolves the migrations directory by walking up from the working directory. */
export function resolveMigrationsDir(startDir: string = process.cwd()): string {
  let current = startDir;
  for (let depth = 0; depth < 6; depth++) {
    const candidate = join(current, 'prisma', 'migrations');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`Could not locate prisma/migrations by walking up from ${startDir}`);
}

/**
 * Runs the check and returns the process exit code.
 *
 * `readApplied` is injectable so the mismatch branch can be driven directly. The only way
 * to reach it otherwise is to rename a real migration folder in a subprocess, which proves
 * the command works but leaves the decision invisible to coverage - and a branch nobody can
 * see is a branch nobody reviews.
 */
export async function runMigrationHistoryCheck(
  readApplied: (databaseUrl: string) => Promise<AppliedMigration[]> = readAppliedHistory,
): Promise<number> {
  let migrationsDir: string;
  try {
    migrationsDir = resolveMigrationsDir();
  } catch (error) {
    console.error(
      `migration history: cannot run - ${error instanceof Error ? error.message : String(error)}`,
    );
    return 1;
  }

  const folders = listMigrationFolders(migrationsDir);

  // A missing DATABASE_URL is a FAILURE, not a quiet pass. The check exists to prove the
  // applied history matches the repository; without a database it proves nothing, and
  // reporting that as success is how a guard comes to be trusted without ever having been
  // satisfied. This is also why the check no longer runs as part of `npm run lint`.
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    console.error(
      'migration history: cannot run - DATABASE_URL is not set.\n' +
        'This check compares the migrations the DATABASE has applied against the ones in the\n' +
        'repository, so it needs a database. Copy .env.example to .env, or start one with\n' +
        '`docker compose up -d --wait db`, then re-run:\n' +
        '  npm run check:migrations\n' +
        'Nothing was compared, so nothing has been proven.',
    );
    return 1;
  }

  // Read what the database actually recorded. Prisma writes this table itself; reading
  // it directly is the only way to know the applied history without asking Prisma to
  // deploy something.
  let applied: AppliedMigration[];
  try {
    applied = await readApplied(databaseUrl);
  } catch (error) {
    // An unreachable database is a failure, not "could not run". The pipeline must not
    // treat a down database as a pass.
    console.error(
      'migration history: cannot run - the database could not be read: ' +
        `${error instanceof Error ? error.message : String(error)}\n` +
        'The applied history was NOT compared, so nothing has been proven. Check that the\n' +
        'database is running and that DATABASE_URL points at it.',
    );
    return 1;
  }

  const problems = compareHistory(applied, folders);

  if (problems.length > 0) {
    console.error(
      `migration history: ${problems.length} problem(s) between the applied history and the ` +
        `repository (${migrationsDir}):`,
    );
    for (const problem of problems) {
      console.error(`  [${problem.kind}] ${problem.message}`);
    }
    return 1;
  }

  console.log(
    `migration history: consistent. ${applied.length} applied migration(s) match ` +
      `${folders.length} migration folder(s).`,
  );
  return 0;
}

/**
 * Reads `_prisma_migrations` through the generated Prisma client.
 *
 * The client is imported dynamically rather than at module load so that the pure
 * comparison logic above stays importable - and testable - without a generated client or
 * a database. A missing client is reported as "the check could not run" (exit 1), never
 * as a pass.
 */
async function readAppliedHistory(databaseUrl: string): Promise<AppliedMigration[]> {
  const { PrismaClient } = (await import('@prisma/client')) as unknown as {
    PrismaClient: new (options: { datasources: { db: { url: string } } }) => {
      $queryRawUnsafe: (sql: string) => Promise<AppliedMigration[]>;
      $disconnect: () => Promise<void>;
    };
  };

  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    return await client.$queryRawUnsafe(
      'SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations',
    );
  } finally {
    await client.$disconnect();
  }
}

const invokedDirectly =
  typeof process.argv[1] === 'string' && process.argv[1].includes('check-migration-history');

if (invokedDirectly) {
  void runMigrationHistoryCheck().then((code) => process.exit(code));
}