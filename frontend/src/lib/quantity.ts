/**
 * Exact decimal arithmetic for quantities using scaled integers (BigInt).
 *
 * Quantities are Decimal(14, 3): up to 14 digits, 3 fractional places.
 * All values are stored and transported as decimal strings (FR-039), but
 * arithmetic is performed on thousandths (scaled by 1000) using BigInt, so
 * `0.1 + 0.2` can never produce `0.30000000000000004`.
 *
 * No floating point is used anywhere in this module. No dependency is added:
 * BigInt is a built-in JavaScript type.
 */

/** Scale factor: quantities have 3 decimal places, so we scale by 1000. */
const SCALE = 1000n;

/**
 * Converts a decimal string (up to 3 fractional digits) to a scaled bigint.
 *
 * "12.345" -> 12345n   "12.3" -> 12300n   "12" -> 12000n   "-0.001" -> -1n
 *
 * Never converts through `Number` or `parseFloat`.
 */
export function toThousandths(value: string): bigint {
  const sign = value.startsWith('-') ? -1n : 1n;
  const abs = sign === -1n ? value.slice(1) : value;
  const [intPart = '0', fracPart = ''] = abs.split('.');

  // Pad or truncate fractional part to exactly 3 digits
  const padded = fracPart.padEnd(3, '0').slice(0, 3);

  // Strip leading zeros from integer part, keep at least '0'
  const cleaned = intPart.replace(/^0+(?=\d)/, '') || '0';

  return sign * (BigInt(cleaned) * SCALE + BigInt(padded));
}

/**
 * Converts a scaled bigint back to a decimal string with 3 fractional digits.
 *
 * 12345n -> "12.345"   12000n -> "12.000"   -1n -> "-0.001"
 */
export function fromThousandths(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const abs = value < 0n ? -value : value;
  const intPart = (abs / SCALE).toString();
  const fracPart = (abs % SCALE).toString().padStart(3, '0');
  return `${sign}${intPart}.${fracPart}`;
}

/**
 * Adds decimal strings as scaled integers, returning a decimal string with
 * 3 fractional digits. Never uses floating point.
 */
export function addQuantities(...values: readonly string[]): string {
  let total = 0n;
  for (const value of values) {
    total += toThousandths(value);
  }
  return fromThousandths(total);
}

/**
 * Subtracts decimal strings as scaled integers, returning a decimal string
 * with 3 fractional digits. Never uses floating point.
 */
export function subtractQuantities(minuend: string, ...subtrahends: readonly string[]): string {
  let total = toThousandths(minuend);
  for (const value of subtrahends) {
    total -= toThousandths(value);
  }
  return fromThousandths(total);
}

/**
 * Compares two decimal strings as scaled integers.
 * Returns -1 if a < b, 0 if a === b, 1 if a > b.
 * Never uses floating point.
 */
export function compareQuantities(a: string, b: string): number {
  const ta = toThousandths(a);
  const tb = toThousandths(b);
  if (ta < tb) return -1;
  if (ta > tb) return 1;
  return 0;
}

/**
 * Formats a quantity decimal string for display with 3 decimal places.
 */
export function formatQuantity(value: string): string {
  return fromThousandths(toThousandths(value));
}

/**
 * Trims trailing fractional zeros from a quantity string for compact display.
 * "40.000" -> "40"   "2.500" -> "2.5"   "0.050" -> "0.05"   "40" -> "40"
 * Pure string work, never a float.
 */
export function compactQuantity(value: string): string {
  const [intPart, fracPart = ''] = value.split('.');
  if (fracPart === '') return intPart;
  const trimmed = fracPart.replace(/0+$/, '');
  return trimmed === '' ? intPart : `${intPart}.${trimmed}`;
}

// --- Money ------------------------------------------------------------------
// Unit costs are Decimal(14, 4), amounts Decimal(14, 2). The same scaled-integer
// rules apply, just with different scale factors.

/** Unit costs have 4 decimal places, so they scale by 10 000. */
const UNIT_SCALE = 10000n;

/** Converts a unit-cost decimal string (up to 4 fractional digits) to a scaled bigint. */
export function toTenThousandths(value: string): bigint {
  const sign = value.startsWith('-') ? -1n : 1n;
  const abs = sign === -1n ? value.slice(1) : value;
  const [intPart = '0', fracPart = ''] = abs.split('.');

  const padded = fracPart.padEnd(4, '0').slice(0, 4);
  const cleaned = intPart.replace(/^0+(?=\d)/, '') || '0';

  return sign * (BigInt(cleaned) * UNIT_SCALE + BigInt(padded));
}

/** Converts a money decimal string (up to 2 fractional digits) to an integer number of cents. */
export function toCents(value: string): bigint {
  const sign = value.startsWith('-') ? -1n : 1n;
  const abs = sign === -1n ? value.slice(1) : value;
  const [intPart = '0', fracPart = ''] = abs.split('.');

  const padded = fracPart.padEnd(2, '0').slice(0, 2);
  const cleaned = intPart.replace(/^0+(?=\d)/, '') || '0';

  let cents = BigInt(cleaned) * 100n + BigInt(padded);

  // More than 2 fractional digits: round half-up on the first extra digit.
  const extra = fracPart.slice(2);
  if (extra !== '' && BigInt(extra[0]) >= 5n) {
    cents += 1n;
  }

  return sign * cents;
}

/** Converts an integer number of cents back to a 2-decimal money string. */
export function centsToString(cents: bigint): string {
  const sign = cents < 0n ? '-' : '';
  const abs = cents < 0n ? -cents : cents;
  const intPart = (abs / 100n).toString();
  const fracPart = (abs % 100n).toString().padStart(2, '0');
  return `${sign}${intPart}.${fracPart}`;
}

/**
 * Line total of a purchase order line: quantity (3dp) times unit cost (4dp),
 * rounded half-up to 2 decimal places. Exact, no floating point.
 *
 * Check vectors:
 *   3.333 x 1.2345 = 4.1145285 -> 4.11
 *   1.000 x 0.0050 = 0.005     -> 0.01
 *   2.500 x 4.5000 = 11.25     -> 11.25
 */
export function multiplyQuantities(quantity: string, unitCost: string): string {
  const product = toThousandths(quantity) * toTenThousandths(unitCost); // scale 1e7
  const cents = (product + 50000n) / 100000n; // half-up; quantities and costs are non-negative here
  return centsToString(cents);
}

/** Sums money strings exactly by adding cents. */
export function sumMoney(...values: readonly string[]): string {
  let total = 0n;
  for (const value of values) {
    total += toCents(value);
  }
  return centsToString(total);
}
