#!/usr/bin/env node
/**
 * Host guard for `db:reset`.
 *
 * `prisma migrate reset --force` drops every table, so it may only run against:
 *   1. a local database (host localhost or 127.0.0.1), or
 *   2. a database whose NAME ends with `_test` (dedicated test databases).
 *
 * When the target is hosted, the EXPECTED_DATABASE_REF check also applies
 * (see databaseRefMismatch): the username must carry the project ref.
 *
 * On refusal it prints the masked host, database name, and the reason. It
 * never prints the password. Exit 0 allows prisma to run; any refusal exits 1.
 */

import {
  databaseRefMismatch,
  isLocalHost,
  loadDatabaseTarget,
} from './db-url';

const loaded = loadDatabaseTarget();

if (!loaded) {
  console.error(
    'db:reset: refused — DATABASE_URL is not set. Copy .env.example to .env and set DATABASE_URL, then re-run.',
  );
  process.exit(1);
}

const { target } = loaded;
const databaseNameAllowed = target.database !== null && target.database.endsWith('_test');

if (!isLocalHost(target.host) && !databaseNameAllowed) {
  console.error(
    `db:reset: refused — host "${target.host ?? '(unknown)'}" is not localhost/127.0.0.1 and ` +
      `database "${target.database ?? '(unknown)'}" does not end with "_test". ` +
      `Target (password masked): ${target.maskedUrl}`,
  );
  process.exit(1);
}

const refMismatch = databaseRefMismatch(target);
if (refMismatch !== null) {
  console.error(`db:reset: refused — ${refMismatch}`);
  process.exit(1);
}

console.log(`db:reset: allowed — host "${target.host}", database "${target.database}".`);
if (databaseNameAllowed && !isLocalHost(target.host)) {
  console.log('db:reset: database name ends with "_test"; hosted test database permitted.');
}
