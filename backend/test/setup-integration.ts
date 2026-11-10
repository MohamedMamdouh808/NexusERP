/**
 * Integration test bootstrap.
 *
 * Requires a real PostgreSQL instance (FR-047). Fails fast with a message naming what
 * is missing rather than letting every test fail with a confusing connection error.
 *
 * Test isolation: DATABASE_URL must NOT target schema "public". Tests run against an
 * isolated `nexuserp_test` schema created and migrated by the test setup. The public
 * schema is never modified by tests.
 *
 * Point DATABASE_URL at a database you are willing to have migrated and truncated.
 */

import { isPublicSchema, loadDatabaseTarget } from '../../database/scripts/db-url';

const loaded = loadDatabaseTarget();

if (!loaded) {
  throw new Error(
    'DATABASE_URL is not set. Integration tests require a real PostgreSQL instance ' +
      '(Constitution Principle V, FR-047): set DATABASE_URL in `.env` to a database you ' +
      'are willing to have migrated and truncated, then re-run. SQLite and in-memory ' +
      'substitutes are not acceptable.',
  );
}

const { target, url } = loaded;

if (isPublicSchema(url)) {
  throw new Error(
    'DATABASE_URL targets schema "public". Integration tests must use an isolated schema ' +
      '(e.g. schema=nexuserp_test) so the public schema is never modified by tests. ' +
      `Target (password masked): ${target.maskedUrl}`,
  );
}
