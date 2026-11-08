#!/usr/bin/env node
/**
 * Guard for the integration test suite (`npm run test:integration`).
 *
 * Integration tests boot the real application against a REAL PostgreSQL
 * instance and create rows. They must only ever run against:
 *   1. a local database (host localhost or 127.0.0.1), or
 *   2. a database whose NAME ends with `_test` (dedicated test databases).
 *
 * When the target is hosted, the EXPECTED_DATABASE_REF check also applies.
 *
 * On refusal it prints the masked host, database name, and reason — so a
 * developer sees exactly which database was protected. It never prints the
 * password. Exit 0 allows the chained jest command to run; refusal exits 1.
 */

import {
  databaseRefMismatch,
  isLocalHost,
  loadDatabaseTarget,
} from './db-url';

const loaded = loadDatabaseTarget();

if (!loaded) {
  console.error(
    'test:integration: refused — DATABASE_URL is not set. Integration tests need a real PostgreSQL instance.',
  );
  process.exit(1);
}

const { target } = loaded;
const databaseNameAllowed = target.database !== null && target.database.endsWith('_test');

if (!isLocalHost(target.host) && !databaseNameAllowed) {
  console.error(
    `test:integration: refused — host "${target.host ?? '(unknown)'}" is not localhost/127.0.0.1 and ` +
      `database "${target.database ?? '(unknown)'}" does not end with "_test". ` +
      `Integration tests would write into this database. Target (password masked): ${target.maskedUrl}`,
  );
  process.exit(1);
}

const refMismatch = databaseRefMismatch(target);
if (refMismatch !== null) {
  console.error(`test:integration: refused — ${refMismatch}`);
  process.exit(1);
}

console.log(`test:integration: allowed — host "${target.host}", database "${target.database}".`);
if (databaseNameAllowed && !isLocalHost(target.host)) {
  console.log('test:integration: database name ends with "_test"; hosted test database permitted.');
}
