import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';


/** npx is 
px.cmd on Windows and is not spawnable as a bare name. */
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
 */

/** The Prisma client used by tests. Lazily created so importing this file is free. */
let testClient: PrismaClient | null = null;

export function getTestPrisma(): PrismaClient {
  if (!testClient) {
    testClient = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
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
 * Applies every pending migration.
 *
 * Uses `migrate deploy` because it never authors, regenerates, or discards a
 * migration - which is the correct behaviour in an automated environment
 * (research.md R-010).
 */
export function applyMigrations(): void {
  const apiRoot = '.';
  execFileSync(npxCommand(), ['prisma', 'migrate', 'deploy'], {
    shell: true,
    cwd: apiRoot,
    stdio: 'inherit',
    env: { ...process.env },
  });
}

/**
 * Truncates every table so each test starts from a known empty state.
 *
 * `CASCADE` handles foreign keys between the tables. This is a truncation rather than a
 * transaction rollback so a test that intentionally commits still leaves nothing behind.
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
 * avoids a subprocess per assertion. It also removes a dependency on `npx` being spawnable,
 * which it is not on Windows without an explicit shell - a real portability bug that this
 * test would otherwise have been blamed for.
 */
export async function seedTestDatabase(): Promise<void> {
  const { seed } = await import('../../../database/prisma/seed');
  await seed(getTestPrisma());
}