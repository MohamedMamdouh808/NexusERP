#!/usr/bin/env node
/**
 * One-off helper: create the dedicated integration-test database `postgres_test`
 * on the EXISTING Supabase project so integration tests have a legal target.
 *
 * The DATABASE_URL is read from the process environment or the root .env; it is
 * never printed. For hosted targets the username must contain
 * EXPECTED_DATABASE_REF (same guarantee as the write guard).
 */
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = resolve(__dirname, '..', '..');
const envPath = join(repoRoot, '.env');

let databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl && existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('DATABASE_URL=')) databaseUrl = trimmed.slice('DATABASE_URL='.length).replace(/^"|"$/g, '');
  }
}
const refMatch = databaseUrl?.match(/^postgres(?:ql)?:\/\/([^:@/]+)/);
const username = refMatch?.[1] ?? null;
const expectedRef = process.env.EXPECTED_DATABASE_REF;
if (databaseUrl && username && (expectedRef && !username.includes(expectedRef))) {
  console.error(`refused: username "${username}" does not contain expected ref (never targeting the wrong project).`);
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$executeRawUnsafe('CREATE DATABASE "postgres_test"');
    console.log('created database "postgres_test"');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log('CREATE DATABASE result:', message.slice(0, 200));
  } finally {
    await prisma.$disconnect();
  }
}

void main();
