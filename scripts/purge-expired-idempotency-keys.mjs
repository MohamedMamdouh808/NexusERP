#!/usr/bin/env node
/**
 * purge-expired-idempotency-keys.mjs
 *
 * Removes the idempotency claims that have expired (PRD 9.6: a claim is
 * remembered for 24 hours). An expired claim is treated as absent by the
 * service anyway - this only keeps the table from growing without bound.
 *
 * Deletes rows only; it never touches a business table. Never prints
 * DATABASE_URL or any password.
 *
 * Usage:
 *   node scripts/purge-expired-idempotency-keys.mjs
 *
 * The schema is the one DATABASE_URL names, so the same script serves the
 * isolated test schema and the shared one.
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

async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url: loadDatabaseUrl() } } });
  try {
    const before = await prisma.idempotencyKey.count();
    const removed = await prisma.idempotencyKey.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    const after = await prisma.idempotencyKey.count();
    console.log(
      `[purge-expired-idempotency-keys] ${removed.count} expired claim(s) removed; ${after} claim(s) remain (of ${before}).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`[purge-expired-idempotency-keys] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
