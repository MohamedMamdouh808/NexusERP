#!/usr/bin/env node
/**
 * Schema numeric-type checker.
 *
 * Constitution Principle IV states that money and quantities use exact decimals and
 * that floating-point arithmetic is prohibited. In the database that prohibition has
 * one concrete meaning: a monetary or quantity column MUST NOT be declared as Float.
 *
 * A comment in schema.prisma asking developers not to do this is advice. This script
 * is a gate. Without it, a later feature can add `onHand Float` and nothing fails until
 * a stock balance is wrong by a fraction of a unit.
 *
 * What it checks:
 *   - any model field typed `Float`                     -> FAIL
 *   - any `@db.Decimal(p, s)` outside the allowed set   -> FAIL
 *   - the real schema, plus the documented conventions -> OK
 *
 * Exit codes: 0 clean, 1 violation found, 2 the schema file could not be read.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface NumericTypeFinding {
  readonly line: number;
  readonly rule: 'float-column' | 'bad-precision';
  readonly message: string;
}

/** Allowed decimal precisions, per the conventions documented in schema.prisma. */
export const ALLOWED_PRECISIONS: readonly string[] = [
  'Decimal(14,2)',
  'Decimal(14,4)',
  'Decimal(14,3)',
];

const PRECISION_LABELS: Readonly<Record<string, string>> = {
  'Decimal(14,2)': 'money',
  'Decimal(14,4)': 'unit price or unit cost',
  'Decimal(14,3)': 'quantity',
};

/** Strips line comments so a `Float` mentioned in prose is not a false positive. */
export function stripComments(line: string): string {
  return line
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, (whole, prefix: string) => prefix + ' '.repeat(whole.length - prefix.length));
}

/**
 * Analyses schema text and returns every numeric-type violation.
 *
 * Exported so the test (T107) can feed it a sample schema containing a Float column and
 * assert it is detected, rather than only ever running it against the real file.
 */
export function analyzeSchemaText(text: string): NumericTypeFinding[] {
  const findings: NumericTypeFinding[] = [];

  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = stripComments(raw);
    const lineNumber = index + 1;

    // A field line looks like `  fieldName Type @...`. Requiring the leading
    // indentation and a type token avoids matching prose and map directives.
    const fieldMatch = line.match(/^\s{2,}[A-Za-z_][A-Za-z0-9_]*\s+([A-Z][A-Za-z]*)/);
    if (!fieldMatch) continue;
    const type = fieldMatch[1];
    if (!type) continue;

    if (type === 'Float') {
      findings.push({
        line: lineNumber,
        rule: 'float-column',
        message:
          'Float column found. Constitution Principle IV prohibits floating-point storage for money and ' +
          'quantities. Use Decimal with an approved precision: ' +
          `${ALLOWED_PRECISIONS.join(', ')}.`,
      });
      continue;
    }

    if (type === 'Decimal') {
      const precisionMatch = line.match(/@db\.Decimal\((\d+),\s*(\d+)\)/);
      if (!precisionMatch) {
        findings.push({
          line: lineNumber,
          rule: 'bad-precision',
          message:
            'Decimal column without an explicit @db.Decimal(precision, scale). Add one of: ' +
            `${ALLOWED_PRECISIONS.join(', ')}.`,
        });
        continue;
      }
      const found = `Decimal(${precisionMatch[1]},${precisionMatch[2]})`;
      if (!ALLOWED_PRECISIONS.includes(found)) {
        const approved = ALLOWED_PRECISIONS.map(
          (allowed) => `${allowed} (${PRECISION_LABELS[allowed] ?? 'unclassified'})`,
        ).join(', ');
        findings.push({
          line: lineNumber,
          rule: 'bad-precision',
          message:
            `Decimal(${precisionMatch[1]},${precisionMatch[2]}) is not an approved precision. ` +
            `Approved: ${approved}.`,
        });
      }
    }
  }

  return findings;
}

/** Reads and analyses the real Prisma schema. */
export function analyzeSchemaFile(schemaPath: string): NumericTypeFinding[] {
  let text: string;
  try {
    text = readFileSync(schemaPath, 'utf8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read the Prisma schema at ${schemaPath}: ${reason}`);
  }
  return analyzeSchemaText(text);
}

/**
 * Resolves the schema path by walking up from the working directory.
 *
 * Checks `prisma/schema.prisma` (when run from `database/`) and
 * `database/prisma/schema.prisma` (when run from the repo root, `backend/`, etc.),
 * so the command works from any workspace in the restructured repository.
 */
export function defaultSchemaPath(startDir: string = process.cwd()): string {
  let current = startDir;
  for (let depth = 0; depth < 6; depth++) {
    const direct = join(current, 'prisma', 'schema.prisma');
    if (existsSync(direct)) return direct;
    const nested = join(current, 'database', 'prisma', 'schema.prisma');
    if (existsSync(nested)) return nested;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`Could not locate prisma/schema.prisma by walking up from ${startDir}`);
}

function main(): void {
  let schemaPath: string;
  try {
    schemaPath = defaultSchemaPath();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
    return;
  }

  let findings: NumericTypeFinding[];
  try {
    findings = analyzeSchemaFile(schemaPath);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
    return;
  }

  if (findings.length === 0) {
    console.log('schema numeric types: OK - no Float columns, all decimal precisions approved');
    process.exit(0);
  }

  console.error('schema numeric types: FAILED');
  console.error(
    'Constitution Principle IV prohibits floating-point storage for money and quantities.\n',
  );
  for (const finding of findings) {
    console.error(`  ${schemaPath}:${finding.line}  ${finding.message}`);
  }
  console.error(
    `\n${findings.length} violation(s). Approved precisions: ${ALLOWED_PRECISIONS.join(', ')}.`,
  );
  process.exit(1);
}

// Only run as a script, so importing this module from a test does not execute it.
const invokedDirectly =
  typeof process.argv[1] === 'string' &&
  process.argv[1].includes('check-schema-numeric-types');

if (invokedDirectly) {
  main();
}