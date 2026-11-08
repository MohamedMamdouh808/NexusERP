#!/usr/bin/env node
/**
 * Guard for any command that WRITES to a hosted database
 * (`db:migrate`, `db:migrate:dev`, `db:seed` — and any integration run).
 *
 * The command refuses unless the DATABASE_URL username contains the expected
 * project ref (EXPECTED_DATABASE_REF, e.g. the Supabase ref `postgres.<ref>`),
 * so migrations can never be pointed at the wrong project by a stale env file.
 * Local databases (host localhost / 127.0.0.1) are exempt: their usernames
 * carry no ref.
 *
 * On refusal it prints the masked host, database name, and reason. It never
 * prints the password. Exit 0 allows the chained command to run; refusal exits 1.
 */

import {
  databaseRefMismatch,
  isLocalHost,
  loadDatabaseTarget,
  readEnvValue,
} from './db-url';

const loaded = loadDatabaseTarget();

if (!loaded) {
  console.error(
    'db-write-guard: refused — DATABASE_URL is not set. Copy .env.example to .env and set DATABASE_URL, then re-run.',
  );
  process.exit(1);
}

const { target } = loaded;

const refMismatch = databaseRefMismatch(target);
if (refMismatch !== null) {
  console.error(`db-write-guard: refused — ${refMismatch}`);
  process.exit(1);
}

console.log(
  `db-write-guard: allowed — host "${target.host}", database "${target.database}" ` +
      `(${isLocalHost(target.host) ? 'local database' : `username ref matches "${readEnvValue('EXPECTED_DATABASE_REF') ?? ''}"`}).`,
);
