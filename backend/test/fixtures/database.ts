import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import {
  isPublicSchema,
  loadDatabaseTarget,
  replaceSchema,
} from '../../../database/scripts/db-url';


/** npx is px.cmd on Windows and is not spawnable as a bare name. */
export function npxCommand(): string { return process.platform === 'win32' ? 'npx.cmd' : 'npx'; }

/**
 * Database helpers for integration tests.
 *
 * IMPORTANT: these helpers TRUNCATE tables. Point DATABASE_URL at a database you are
 * willing to lose. Never run the integration suite against a database holding data you
 * care about.
 *
 * The suite uses a real PostgreSQL instance, never a substitute. The defects that matter
 * in this product - races, duplicate posts, partial writes - do not appear against a
 * faked database (Constitution Principle V, research.md R-020).
 *
 * Test isolation: every run uses an isolated Prisma schema (`nexuserp_test`) in the same
 * database. The public schema is never modified by tests. The schema is created and
 * migrated by the test setup before any test runs.
 */

/** The Prisma client used by tests. Lazily created so importing this file is free. */
let testClient: PrismaClient | null = null;

/** Resolves the test DATABASE_URL: schema must not be public; rewritten to nexuserp_test. */
export function resolveTestDatabaseUrl(): string {
  const loaded = loadDatabaseTarget();
  if (!loaded) {
    throw new Error(
      'DATABASE_URL is not set. Integration tests require a real PostgreSQL instance ' +
        '(Constitution Principle V, FR-047): set DATABASE_URL in `.env` to a database you ' +
        'are willing to have migrated and truncated, then re-run. SQLite and in-memory ' +
        'substitutes are not acceptable.',
    );
  }

  const { target, url } = loaded;

  if (isPublicSchema(url)) {
    throw new Error(
      'DATABASE_URL targets schema "public". Integration tests must use an isolated schema ' +
        '(e.g. schema=nexuserp_test) so the public schema is never modified by tests. ' +
        `Target (password masked): ${target.maskedUrl}`,
    );
  }

  return replaceSchema(url, 'nexuserp_test');
}

/** The Prisma client used by tests, connected to the isolated nexuserp_test schema. */
export function getTestPrisma(): PrismaClient {
  if (!testClient) {
    testClient = new PrismaClient({
      datasources: { db: { url: resolveTestDatabaseUrl() } },
      log: ['warn', 'error'],
    });
  }
  return testClient;
}

export async function disconnectTestPrisma(): Promise<void> {
  if (testClient) {
    await testClient.$disconnect();
    testClient = null;
  }
}

/**
 * Applies every pending migration against the isolated test schema.
 *
 * Uses `migrate deploy` because it never authors, regenerates, or discards a
 * migration - which is the correct behaviour in an automated environment
 * (research.md R-010).
 */
export function applyMigrations(): void {
  const testUrl = resolveTestDatabaseUrl();
  const apiRoot = '.';
  execFileSync(npxCommand(), ['prisma', 'migrate', 'deploy'], {
    shell: true,
    cwd: apiRoot,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testUrl },
  });
}

/**
 * Ensures the isolated test schema exists and is migrated before any test runs.
 *
 * Creates `nexuserp_test` if it does not exist, then runs `prisma migrate deploy`
 * against it. This guarantees a clean, migrated schema for every test run while
 * leaving the public schema untouched.
 */
export function prepareTestSchema(): void {
  const loaded = loadDatabaseTarget();
  if (!loaded) {
    throw new Error('DATABASE_URL is not set; cannot prepare test schema.');
  }

  const { url } = loaded;

  if (isPublicSchema(url)) {
    throw new Error(
      'DATABASE_URL targets schema "public". Refusing to prepare test schema against public.',
    );
  }

  const prisma = new PrismaClient({
    datasources: { db: { url } },
  });

  try {
    // Create the isolated schema if it does not exist.
    void prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS nexuserp_test`);
  } finally {
    void prisma.$disconnect();
  }

  // Now run migrations against the test schema.
  applyMigrations();
}

/**
 * Truncates every table so each test starts from a known empty state.
 *
 * `CASCADE` handles foreign keys between the tables. This is a truncation rather than a
 * transaction rollback so a test that intentionally commits still leaves nothing behind.
 * Only tables in the test schema are touched; public schema is never modified.
 */
export async function resetDatabase(): Promise<void> {
  const prisma = getTestPrisma();
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      role_template_permissions,
      role_templates,
      permissions
    RESTART IDENTITY CASCADE
  `);
}

/**
 * Loads the reference catalog into the test database. Safe to call repeatedly.
 *
 * Calls the SHIPPED seed function in-process rather than spawning `npx tsx prisma/seed.ts`.
 * Running the identical code path is what makes the idempotency test meaningful, and it
 * avoids a dependency on `npx` being spawnable, which it is not on Windows without an explicit
 * shell - a real portability bug that this test would otherwise have been blamed for.
 */
export async function seedTestDatabase(): Promise<void> {
  const { seed } = await import('../../../database/prisma/seed');
  await seed(getTestPrisma());
}
