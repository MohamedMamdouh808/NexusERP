/**
 * check-naming-convention.ts
 *
 * Fails when a NEW migration creates a camelCase table or column.
 *
 * The rule: every table and every column is snake_case. Prisma models carry the
 * snake_case name in `@map`, so the ORM and the database agree, and a query
 * written by hand in SQL reads like the query the ORM generates.
 *
 * Existing migrations are grandfathered through an explicit allowlist: they
 * are already applied to real databases, and a migration is never edited after
 * it is applied. The allowlist names them one by one, so "this one is old" is
 * a decision someone wrote down, not a silent rule that skips everything from
 * a date onwards.
 *
 * Read-only: it reads the migration files and prints what it found. It never
 * touches a database and never prints a connection string.
 *
 * Usage: npx tsx database/scripts/check-naming-convention.ts
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * The migrations that are already applied somewhere and are therefore left as
 * they are. A migration is never edited after it is applied, so this list only
 * ever grows - and every entry is a deliberate decision to grandfather a name.
 */
const GRANDFATHERED_MIGRATIONS = [
  '20261018100057_init_reference_tables',
  '20261108004024_enable_rls_on_all_tables',
  '20261108010540_auth_organizations_users',
  '20261108010542_sessions_rate_limiting',
  '20261108012225_fix_role_permission_column',
  '20261108060000_repair_drift_from_mutated_migrations',
  '20261110000001_rbac_audit_log',
  '20261110000002_backfill_roles_permissions_memberships',
  '20261110000003_fix_earliest_administrator',
  '20261110000004_audit_log_append_only',
  '20261110000005_revoke_truncate_privilege',
  '20261110000006_enable_rls_all_tables',
  '20261110000007_audit_log_survives_actor_delete',
  '20261110000008_align_audit_membership_roles_to_schema',
  '20261110000009_audit_search_path_and_schema_parity',
  '20261110000010_create_contacts_table',
] as const;

/** snake_case: lowercase letters, digits and underscores, never starting with a digit. */
export function isSnakeCase(name: string): boolean {
  return /^[a-z_][a-z0-9_]*$/.test(name);
}

export interface NamingViolation {
  /** The migration folder the violation was found in. */
  readonly migration: string;
  /** The offending identifier. */
  readonly identifier: string;
  /** What kind of thing it is: a table, a column or an index. */
  readonly kind: 'table' | 'column' | 'index';
  /** The line the identifier was found on (1-based). */
  readonly line: number;
}

/**
 * Splits a SQL fragment on top-level commas.
 *
 * A comma inside a type (`NUMERIC(14,2)`) or inside a function call is not a
 * separator, so the nesting depth is tracked.
 */
export function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const character of body) {
    if (character === '(') depth += 1;
    if (character === ')') depth -= 1;
    if (character === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  if (current.trim().length > 0) parts.push(current);
  return parts;
}

/** The keywords that introduce a table CONSTRAINT, not a column. */
const NOT_A_COLUMN = [
  'CONSTRAINT',
  'PRIMARY',
  'UNIQUE',
  'CHECK',
  'FOREIGN',
  'EXCLUDE',
  'LIKE',
];

/**
 * Blanks out the CONTENT of SQL line comments, keeping every character position.
 *
 * A comment inside a CREATE TABLE is not a column. Without this, the checker
 * reads `-- A note is required ...` as a column named "--" and reports a
 * violation that does not exist - which is what happened to the inventory
 * migrations, whose explanatory comments sit inside the table body.
 *
 * The characters are REPLACED by spaces rather than removed, so every offset
 * stays the same and the reported line numbers still point at the original
 * file. Block comments are not touched: no migration in this repository uses
 * one inside a table body.
 */
export function blankOutLineComments(sql: string): string {
  let result = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];

    if (inLineComment) {
      if (character === '\n') {
        inLineComment = false;
        result += character;
      } else {
        result += ' ';
      }
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && character === '-' && sql[index + 1] === '-') {
      inLineComment = true;
      result += '  ';
      index += 1;
      continue;
    }

    if (character === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote;
    else if (character === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote;

    result += character;
  }

  return result;
}

/**
 * Finds the camelCase identifiers in a migration.
 *
 * Only the statements that CREATE a table or a column are inspected: renaming
 * an existing column, dropping one, or adding a constraint says nothing about
 * the name of a NEW object. Quoted identifiers are read, so `"myColumn"` is
 * caught exactly as `myColumn` would be.
 */
export function findNamingViolations(migration: string, sql: string): NamingViolation[] {
  const violations: NamingViolation[] = [];

  const lineOf = (offset: number): number => sql.slice(0, offset).split('\n').length;

  // The comments are blanked out for the parsing only; the offsets and the line
  // numbers still come from the original file.
  const parsed = blankOutLineComments(sql);

  // CREATE TABLE "name" ( ... ) - the table name AND every column in the body.
  const createTable =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[\w$]+"?)\s*\(/gi;
  for (const match of parsed.matchAll(createTable)) {
    const table = (match[1] ?? '').replace(/"/g, '');
    const tableOffset = match.index ?? 0;
    if (!isSnakeCase(table)) {
      violations.push({ migration, identifier: table, kind: 'table', line: lineOf(tableOffset) });
    }

    // The body runs to the parenthesis that closes it.
    const open = tableOffset + match[0].length - 1;
    let depth = 0;
    let close = open;
    for (let index = open; index < parsed.length; index += 1) {
      if (parsed[index] === '(') depth += 1;
      else if (parsed[index] === ')') {
        depth -= 1;
        if (depth === 0) {
          close = index;
          break;
        }
      }
    }

    const body = parsed.slice(open + 1, close);
    for (const part of splitTopLevel(body)) {
      const trimmed = part.trim();
      if (trimmed.length === 0) continue;
      const firstToken = trimmed.split(/[\s(]+/)[0] ?? '';
      const name = firstToken.replace(/"/g, '');
      if (name.length === 0) continue;
      if (NOT_A_COLUMN.includes(name.toUpperCase())) continue;
      if (!isSnakeCase(name)) {
        violations.push({
          migration,
          identifier: name,
          kind: 'column',
          line: lineOf(open + body.indexOf(trimmed) + 1),
        });
      }
    }
  }

  // ALTER TABLE ... ADD [COLUMN] "name"
  // A table CONSTRAINT is not a column: `ADD CONSTRAINT "x" FOREIGN KEY ...`
  // adds a constraint, and the constraint's name is a new object but not a
  // column. The keywords are excluded so they are not mistaken for one.
  const addColumn =
    /ALTER\s+TABLE\s+(?:ONLY\s+)?("?[\w$]+"?)\s+ADD\s+(?:COLUMN\s+)?(?!CONSTRAINT\b|PRIMARY\b|UNIQUE\b|CHECK\b|FOREIGN\b|EXCLUDE\b|LIKE\b)(?:IF\s+NOT\s+EXISTS\s+)?("?[\w$]+"?)/gi;
  for (const match of parsed.matchAll(addColumn)) {
    const name = (match[2] ?? '').replace(/"/g, '');
    if (!isSnakeCase(name)) {
      violations.push({
        migration,
        identifier: name,
        kind: 'column',
        line: lineOf(match.index ?? 0),
      });
    }
  }

  // CREATE INDEX "name" ON "table" ("column", ...)
  // The INDEX NAME is a new object and must be snake_case. The COLUMN it
  // indexes is not: an index over a column that predates the convention (the
  // tables that predate it keep their camelCase columns) adds no new name.
  const createIndex =
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[\w$]+"?)\s+ON\s+(?:ONLY\s+)?("?[\w$]+"?)\s*\(([^)]*)\)/gi;
  for (const match of parsed.matchAll(createIndex)) {
    const indexName = (match[1] ?? '').replace(/"/g, '');
    if (!isSnakeCase(indexName)) {
      violations.push({
        migration,
        identifier: indexName,
        kind: 'index',
        line: lineOf(match.index ?? 0),
      });
    }
  }

  return violations;
}

/** The migrations in the repository, newest last. */
export function listMigrations(migrationsDir: string): string[] {
  if (!existsSync(migrationsDir)) return [];
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Runs the guard. Returns the violations it found (empty means the guard passes). */
export function runNamingCheck(migrationsDir: string): NamingViolation[] {
  const grandfathered = new Set<string>(GRANDFATHERED_MIGRATIONS);
  const violations: NamingViolation[] = [];

  for (const migration of listMigrations(migrationsDir)) {
    if (grandfathered.has(migration)) continue;
    const sqlPath = join(migrationsDir, migration, 'migration.sql');
    if (!existsSync(sqlPath)) continue;
    violations.push(...findNamingViolations(migration, readFileSync(sqlPath, 'utf8')));
  }

  return violations;
}

function main(): void {
  const migrationsDir = resolve(__dirname, '..', 'prisma', 'migrations');
  const violations = runNamingCheck(migrationsDir);

  if (violations.length === 0) {
    console.log('naming convention: OK - every new table and column is snake_case');
    return;
  }

  console.error(`naming convention: ${violations.length} violation(s) in new migrations:`);
  for (const violation of violations) {
    console.error(
      `  ${violation.migration}/migration.sql:${violation.line} - ${violation.kind} "${violation.identifier}" is not snake_case`,
    );
  }
  console.error(
    'Rename the object in the migration and map it in the Prisma schema with @map. ' +
      'A migration that is already applied is never edited: add a new migration instead.',
  );
  process.exit(1);
}

if (require.main === module) {
  main();
}
