/**
 * Money is never a JavaScript number (T016).
 *
 * FR-039 and SC-010: every money value the interface can show is a decimal
 * string, all the way to the formatter. A JavaScript number is IEEE-754 binary
 * floating point and cannot represent most decimal fractions exactly, so an
 * amount that passes through one can differ from the server's by a fraction of
 * a unit - and Principle IV makes that a defect rather than a rounding detail.
 *
 * The check is the shared package's own schema rather than a local regular
 * expression, so the frontend and the API agree on what a money string is
 * (FR-038). The second suite proves the check has teeth: a numeric value fails
 * it, which is what makes the first suite worth reading.
 *
 * The gallery fixtures are covered by the third suite. It is written now and
 * becomes live when T055 creates `src/dev/gallery/fixtures.ts`; until then the
 * discovered set is empty and that suite proves nothing on its own, which is why
 * the sample-data suite above is the one that carries the requirement today.
 */

import { describe, expect, it } from 'vitest';

import { decimalString, moneyString, unitPriceString } from '@nexuserp/shared';

import { SAMPLE_RECORDS } from '../sample-data';

/**
 * The fixture modules the third suite reads. A glob rather than an import, so
 * this file compiles and runs before T055 exists and picks the fixtures up
 * automatically the moment they land - without a second edit here.
 */
const fixtureModules = import.meta.glob('../../dev/gallery/fixtures.ts', { eager: true }) as Record<
  string,
  Record<string, unknown>
>;

/** A property name that holds money, and the schema that must accept it. */
const MONEY_KEYS: Readonly<Record<string, typeof decimalString>> = {
  amount: moneyString,
  unitPrice: unitPriceString,
  unitCost: unitPriceString,
};

interface FoundValue {
  readonly path: string;
  readonly key: string;
  readonly value: unknown;
}

/**
 * Walks a fixture's exported values and collects everything sitting under a
 * money-shaped key. Written as a walk rather than a field list so a fixture that
 * nests a row inside a table cannot slip past the check.
 */
function moneyValuesIn(node: unknown, path = '$'): FoundValue[] {
  if (Array.isArray(node)) {
    return node.flatMap((entry, index) => moneyValuesIn(entry, `${path}[${index}]`));
  }

  if (node === null || typeof node !== 'object') return [];

  return Object.entries(node).flatMap(([key, value]) => {
    const here = `${path}.${key}`;

    if (key in MONEY_KEYS) return [{ path: here, key, value }];

    return moneyValuesIn(value, here);
  });
}

describe('sample data - money is a decimal string (FR-039, SC-010)', () => {
  it('has records to check, so the assertions below are not vacuous', () => {
    expect(SAMPLE_RECORDS.length).toBeGreaterThan(0);
  });

  it('gives every amount as a string that the shared money schema accepts', () => {
    for (const record of SAMPLE_RECORDS) {
      expect(typeof record.amount, `${record.id} amount must be a string`).toBe('string');
      expect(moneyString.safeParse(record.amount).success, `${record.id} amount`).toBe(true);
    }
  });

  it('formats every amount to two decimal places, so no row shows an unrounded figure', () => {
    for (const record of SAMPLE_RECORDS) {
      expect(record.amount, record.id).toMatch(/^-?\d+\.\d{2}$/);
    }
  });
});

describe('the money check itself (SC-010)', () => {
  it('rejects a numeric money value', () => {
    expect(moneyString.safeParse(1250).success).toBe(false);
    expect(moneyString.safeParse(1250.0).success).toBe(false);
    expect(moneyString.safeParse(0.1 + 0.2).success).toBe(false);
  });

  it('rejects a money value carrying more precision than an amount can hold', () => {
    expect(moneyString.safeParse('1250.001').success).toBe(false);
  });

  it('accepts the strings the sample data actually uses', () => {
    expect(moneyString.safeParse('1250.00').success).toBe(true);
    expect(moneyString.safeParse('0.00').success).toBe(true);
    expect(moneyString.safeParse('-19.99').success).toBe(true);
  });

  it('catches a numeric money value nested inside a fixture', () => {
    const fixture = { rows: [{ name: 'Shelving unit', amount: 1250.0 }] };

    const found = moneyValuesIn(fixture);

    expect(found).toHaveLength(1);
    expect(found[0].path).toBe('$.rows[0].amount');
    expect(MONEY_KEYS[found[0].key].safeParse(found[0].value).success).toBe(false);
  });
});

describe('gallery fixtures - money is a decimal string (FR-039, SC-010)', () => {
  it('gives every fixture money value as a decimal string', () => {
    for (const [modulePath, module] of Object.entries(fixtureModules)) {
      for (const { path, key, value } of moneyValuesIn(module)) {
        const where = `${modulePath} ${path}`;

        expect(typeof value, `${where} must be a string, not a number`).toBe('string');
        expect(MONEY_KEYS[key].safeParse(value).success, where).toBe(true);
      }
    }
  });
});
