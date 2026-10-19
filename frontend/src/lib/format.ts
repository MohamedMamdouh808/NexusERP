/**
 * Decimal string formatter (T092).
 *
 * Formats monetary and quantity values as strings without ever converting
 * through a JavaScript number (which is IEEE-754 binary floating point and
 * cannot exactly represent many decimal fractions). All operations are done
 * on strings, preserving exact precision.
 *
 * The shared contract (@nexuserp/shared) defines the precision:
 *   money:        Decimal(14, 2)
 *   unit price:   Decimal(14, 4)
 *   quantity:     Decimal(14, 3)
 */

export type Scale = 2 | 3 | 4;

/**
 * Formats a decimal string to the given scale, padding or truncating as needed.
 * Never converts through `Number` or `parseFloat`.
 *
 * @param value - The decimal string (e.g. "123.45", "-0.001", "1000")
 * @param scale - Target number of fractional digits
 * @returns The formatted string with exactly `scale` fractional digits.
 */
export function formatDecimal(value: string, scale: Scale): string {
  if (!value || value.trim() === '') return '0'.padEnd(scale + 1, '0');

  const sign = value.startsWith('-');
  const abs = sign ? value.slice(1) : value;

  const [intPart = '0', fracPart = ''] = abs.split('.');

  // Pad or truncate fractional part
  const padded = fracPart.padEnd(scale, '0').slice(0, scale);

  const intClean = intPart.replace(/^0+(?=\d)/, '') || '0';
  const result = `${intClean}.${padded}`;

  return sign ? `-${result}` : result;
}

/**
 * Parses a decimal string into a normalized form (sign, integer part, fractional part).
 * Never converts through Number.
 */
export function parseDecimal(value: string): { sign: boolean; integer: string; fractional: string } {
  if (!value || value.trim() === '') return { sign: false, integer: '0', fractional: '0' };

  const sign = value.startsWith('-');
  const abs = sign ? value.slice(1) : value;
  const [intPart = '0', fracPart = ''] = abs.split('.');

  return {
    sign,
    integer: intPart.replace(/^0+(?=\d)/, '') || '0',
    fractional: fracPart,
  };
}

/**
 * Compares two decimal strings numerically.
 * Returns -1 if a < b, 0 if a === b, 1 if a > b.
 * Never converts through Number.
 */
export function compareDecimal(a: string, b: string, scale: Scale): number {
  const pa = parseDecimal(a);
  const pb = parseDecimal(b);

  if (pa.sign !== pb.sign) return pa.sign ? -1 : 1;
  if (pa.sign) return pb.integer.localeCompare(pa.integer, undefined, { numeric: true }) * -1;

  const ai = pa.integer.padStart(20, '0');
  const bi = pb.integer.padStart(20, '0');
  if (ai !== bi) return ai.localeCompare(bi, undefined, { numeric: true });

  const af = pa.fractional.padEnd(scale, '0').slice(0, scale);
  const bf = pb.fractional.padEnd(scale, '0').slice(0, scale);
  return af.localeCompare(bf);
}

/**
 * Formats a monetary value (scale 2) for display.
 */
export function formatMoney(value: string): string {
  return formatDecimal(value, 2);
}

/**
 * Formats a unit price (scale 4) for display.
 */
export function formatUnitPrice(value: string): string {
  return formatDecimal(value, 4);
}

/**
 * Formats a quantity (scale 3) for display.
 */
export function formatQuantity(value: string): string {
  return formatDecimal(value, 3);
}