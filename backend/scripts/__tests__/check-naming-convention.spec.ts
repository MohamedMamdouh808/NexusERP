import { describe, expect, it } from '@jest/globals';

import {
  findNamingViolations,
  isSnakeCase,
} from '../../../database/scripts/check-naming-convention';

/**
 * The naming guard.
 *
 * The rule it enforces: a NEW migration creates snake_case tables and
 * columns. The tests below are the guard shown failing on purpose - a
 * camelCase column in a new migration must be reported, with the file and the
 * line, or the guard is decoration.
 */
describe('the naming convention guard', () => {
  it('accepts a snake_case table and columns', () => {
    const sql = `
      CREATE TABLE "contacts" (
        "id" UUID NOT NULL,
        "organization_id" UUID NOT NULL,
        "is_customer" BOOLEAN NOT NULL DEFAULT false
      );
    `;

    expect(findNamingViolations('20990101000000_example', sql)).toEqual([]);
  });

  it('rejects a camelCase column in a new migration', () => {
    const sql = `
      CREATE TABLE "orders" (
        "id" UUID NOT NULL,
        "customerName" VARCHAR(255)
      );
    `;

    const violations = findNamingViolations('20990101000000_example', sql);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      migration: '20990101000000_example',
      identifier: 'customerName',
      kind: 'column',
    });
  });

  it('rejects a camelCase table in a new migration', () => {
    const sql = 'CREATE TABLE "auditLog" ("id" UUID NOT NULL);';

    const violations = findNamingViolations('20990101000000_example', sql);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ identifier: 'auditLog', kind: 'table' });
  });

  it('rejects a camelCase column added to an existing table', () => {
    const sql = 'ALTER TABLE "contacts" ADD COLUMN "isCustomer" BOOLEAN NOT NULL DEFAULT false;';

    const violations = findNamingViolations('20990101000000_example', sql);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ identifier: 'isCustomer', kind: 'column' });
  });

  it('rejects a camelCase index name, but not an index over an existing column', () => {
    // The index name is a new object, so it must be snake_case. The column it
    // indexes is pre-existing: indexing it adds no new name.
    const sql = 'CREATE INDEX "contacts_customerName_idx" ON "contacts" ("customerName");';

    const violations = findNamingViolations('20990101000000_example', sql);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ identifier: 'contacts_customerName_idx', kind: 'index' });
  });

  it('does not report a renamed or dropped object', () => {
    // A migration that renames an existing column is not creating a new name.
    const sql = `
      ALTER TABLE "contacts" RENAME COLUMN "customer_name" TO "customerName";
      ALTER TABLE "contacts" DROP COLUMN "customerName";
    `;

    expect(findNamingViolations('20990101000000_example', sql)).toEqual([]);
  });

  it('does not mistake a table constraint for a column', () => {
    const sql = `
      ALTER TABLE "contacts" DROP CONSTRAINT "contacts_organization_id_fkey";
      ALTER TABLE "contacts"
        ADD CONSTRAINT "contacts_organization_id_fkey"
        FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT;
    `;

    expect(findNamingViolations('20990101000000_example', sql)).toEqual([]);
  });

  it('knows what snake_case is', () => {
    expect(isSnakeCase('organization_id')).toBe(true);
    expect(isSnakeCase('contacts')).toBe(true);
    expect(isSnakeCase('created_at2')).toBe(true);
    expect(isSnakeCase('createdAt')).toBe(false);
    expect(isSnakeCase('CreatedAt')).toBe(false);
    expect(isSnakeCase('2fast')).toBe(false);
  });
});
