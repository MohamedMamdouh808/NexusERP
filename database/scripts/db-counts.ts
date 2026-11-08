#!/usr/bin/env node
/**
 * READ-ONLY table count report for the configured DATABASE_URL.
 *
 * Prints `table_name: row_count` for every base table in the public schema.
 * Used to audit reference-data state (e.g. roles vs role_permissions) and to
 * check row-count invariants around integration runs. Writes nothing.
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = resolve(__dirname, '..', '..');
const envPath = join(repoRoot, '.env');
if (!process.env.DATABASE_URL && existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('DATABASE_URL=')) {
      process.env.DATABASE_URL = trimmed.slice('DATABASE_URL='.length).replace(/^"|"$/g, '');
    }
  }
}

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
  );
  const lines: string[] = [];
  for (const { table_name } of tables) {
    const result = await prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT COUNT(*)::int AS n FROM "${table_name}"`,
    );
    lines.push(`${table_name}: ${result[0]?.n ?? 0}`);
  }
  console.log(lines.join('\n'));
  await prisma.$disconnect();
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('count failed:', message.slice(0, 200));
  process.exitCode = 1;
});
