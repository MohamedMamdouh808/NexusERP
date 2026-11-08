#!/usr/bin/env node
/** READ-ONLY catalog probe via information_schema (pooler-portable). */
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
  const rolesFks = await prisma.$queryRawUnsafe<{ constraint_name: string }[]>(
    "SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'roles' AND constraint_type = 'FOREIGN KEY'",
  );
  const rolePermissionsFks = await prisma.$queryRawUnsafe<{ constraint_name: string }[]>(
    "SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'role_permissions' AND constraint_type = 'FOREIGN KEY'",
  );
  const rolesIndexes = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
    "SELECT indexname FROM pg_indexes WHERE tablename = 'roles' ORDER BY indexname",
  );
  const membershipsUniques = await prisma.$queryRawUnsafe<{ constraint_name: string }[]>(
    "SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'memberships' AND constraint_type = 'UNIQUE'",
  );
  console.log('roles foreign keys:', rolesFks.map((r) => r.constraint_name).join(', '));
  console.log('role_permissions foreign keys:', rolePermissionsFks.map((r) => r.constraint_name).join(', '));
  console.log('roles indexes:', rolesIndexes.map((r) => r.indexname).join(', '));
  console.log('memberships unique constraints:', membershipsUniques.map((r) => r.constraint_name).join(', '));
  await prisma.$disconnect();
}

void main().catch((error: unknown) => {
  console.error('probe failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
