import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

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
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
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

/** Loads the reference catalog into the test database. Safe to call repeatedly. */
export async function seedTestDatabase(): Promise<void> {
  const apiRoot = '.';
  execFileSync('npx', ['tsx', 'prisma/seed.ts'], {
    cwd: apiRoot,
    stdio: 'inherit',
    env: { ...process.env },
  });
}