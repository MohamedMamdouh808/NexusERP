import { describe, expect, it } from 'vitest';
import {
  decimalString,
  moneyString,
  quantityString,
  requestIdSchema,
  unitPriceString,
} from '../schemas/index.js';

/**
 * Constitution Principle IV: a JavaScript number MUST NOT carry a monetary or quantity
 * value at any point. These tests make that structural by asserting the SCHEMA rejects
 * a number, rather than relying on a lint rule that a developer can bypass.
 */
describe('decimalString', () => {
  it('accepts decimal values transported as strings', () => {
    for (const value of ['0', '1250.00', '19.9900', '3.125', '-42.5']) {
      expect(decimalString.safeParse(value).success).toBe(true);
    }
  });

  it('rejects a JavaScript number, and says why', () => {
    for (const value of [1250, 19.99, 3.125, 0.1, -42.5]) {
      const result = decimalString.safeParse(value);
      expect(result.success).toBe(false);
      // The message must tell the developer WHY a number was refused, not merely that
      // a string was expected.
      expect(result.error?.issues[0]?.message).toContain('cannot represent this value exactly');
    }
  });

  it('rejects a non-numeric string', () => {
    for (const value of ['', 'abc', '1.2.3', '1,000', ' 1.00', '1.00 ', 'NaN', 'Infinity']) {
      expect(decimalString.safeParse(value).success).toBe(false);
    }
  });

  it('rejects more than four decimal places', () => {
    expect(decimalString.safeParse('1.00001').success).toBe(false);
    expect(decimalString.safeParse('1.0000').success).toBe(true);
  });
});

describe('precision-specific schemas', () => {
  it('moneyString allows at most two decimal places', () => {
    expect(moneyString.safeParse('1250.00').success).toBe(true);
    expect(moneyString.safeParse('1250.0').success).toBe(true);
    expect(moneyString.safeParse('1250.000').success).toBe(false);
    expect(moneyString.safeParse(1250).success).toBe(false);
  });

  it('unitPriceString allows at most four decimal places', () => {
    expect(unitPriceString.safeParse('19.9900').success).toBe(true);
    expect(unitPriceString.safeParse('19.99000').success).toBe(false);
    expect(unitPriceString.safeParse(19.99).success).toBe(false);
  });

  it('quantityString allows at most three decimal places', () => {
    expect(quantityString.safeParse('3.125').success).toBe(true);
    expect(quantityString.safeParse('3.1250').success).toBe(false);
    expect(quantityString.safeParse(3.125).success).toBe(false);
  });
});

describe('requestIdSchema', () => {
  it('accepts an allowlisted identifier', () => {
    expect(requestIdSchema.safeParse('3f6c1d2e-9a4b-4c1f-8e77-2b5d9a0c1e33').success).toBe(true);
    expect(requestIdSchema.safeParse('req_123.A-b').success).toBe(true);
  });

  it('rejects anything that could forge or split a log line', () => {
    const hostile = [
      'has space',
      'has\nnewline',
      'has\rcarriage',
      'has\ttab',
      'has\u0000null',
      'has"quote',
      "has'apostrophe",
      'has/slash',
      '',
    ];
    for (const value of hostile) {
      expect(requestIdSchema.safeParse(value).success).toBe(false);
    }
  });

  it('rejects an identifier longer than 128 characters', () => {
    expect(requestIdSchema.safeParse('a'.repeat(128)).success).toBe(true);
    expect(requestIdSchema.safeParse('a'.repeat(129)).success).toBe(false);
  });
});