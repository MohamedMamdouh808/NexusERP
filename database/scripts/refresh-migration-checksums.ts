#!/usr/bin/env node
/**
 * One-off maintenance: refresh the recorded checksums in `_prisma_migrations`
 * to match the current repository files.
 *
 * Why this exists: migration `20261108010540_auth_organizations_users` was
 * edited AFTER it had been applied to the development database (its
 * `role_permissions` column was renamed in place). Prisma verifies applied
 * checksums on every `migrate deploy`, so a future deploy against that
 * database would fail until the recorded checksum agrees with the file again.
 * The schema the two versions produce is IDENTICAL (a column rename plus an
 * FK name trade), so refreshing the checksum reconciles file and database.
 *
 * It writes ONLY to `_prisma_migrations`, only rows whose name matches a
 * repository folder, and prints every changed row. Refuses hosted targets
 * whose username does not contain EXPECTED_DATABASE_REF.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const repoRoot = resolve(__dirname, '..', '..');
const envPath = join(repoRoot, '.env');

let databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl && existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('DATABASE_URL=')) {
      databaseUrl = trimmed.slice('DATABASE_URL='.length).replace(/^"|"$/g, '');
    }
  }
}

// Hosted targets must carry the expected project ref in the username.
const username = databaseUrl?.match(/^postgres(?:ql)?:\/\/([^:@/]+)/)?.[1] ?? null;
const expectedRef = process.env.EXPECTED_DATABASE_REF;
if (username && !/^((localhost|127\.0\.0\.1))$/.test(new URL(databaseUrl as string).hostname) && expectedRef && !username.includes(expectedRef)) {
  console.error(`refused: username "${username}" does not contain the expected project ref ` + '("never targeting the wrong project").');
  process.exit(2);
}

const migrationsDir = join(repoRoot, 'database', 'prisma', 'migrations');

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const folders = await prisma.$queryRawUnsafe<{ migration_name: string; checksum: string | null }[]>(
    'SELECT migration_name, checksum FROM _prisma_migrations ORDER BY migration_name',
  );

  let updated = 0;
  for (const applied of folders) {
    const filePath = join(migrationsDir, applied.migration_name, 'migration.sql');
    if (!existsSync(filePath)) {
      console.log(`skip ${applied.migration_name}: no repository file`);
      continue;
    }
    const fileChecksum = createHash('sha256').update(readFileSync(filePath)).digest('hex');
    if (applied.checksum === fileChecksum) continue;

    await prisma.$executeRawUnsafe(
      `UPDATE _prisma_migrations SET checksum = '${fileChecksum}' WHERE migration_name = '${applied.migration_name}'`,
    );
    console.log(
      `refreshed ${applied.migration_name}: ${applied.checksum?.slice(0, 12) ?? 'null'}... -> ${fileChecksum.slice(0, 12)}...`,
    );
    updated += 1;
  }

  console.log(`done. ${updated} checksum(s) refreshed of ${folders.length} applied.`);
}

void main()
  .catch((error: unknown) => {
    console.error('refresh failed:', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
