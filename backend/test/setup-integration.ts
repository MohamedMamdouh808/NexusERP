/**
 * Integration test bootstrap.
 *
 * Requires a real PostgreSQL instance (FR-047). Fails fast with a message naming what
 * is missing rather than letting every test fail with a confusing connection error.
 *
 * Point DATABASE_URL at a database you are willing to have migrated and truncated.
 */

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set. Integration tests require a real PostgreSQL instance ' +
      '(Constitution Principle V, FR-047): set DATABASE_URL in `.env` to a database you ' +
      'are willing to have migrated and truncated, then re-run. SQLite and in-memory ' +
      'substitutes are not acceptable.',
  );
}