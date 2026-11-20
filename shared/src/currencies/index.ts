/**
 * Supported organization currency codes.
 *
 * Currency is a three-letter ISO 4217 code used for display only. v1 performs no
 * conversion — every price, total and report figure uses the organization's code
 * from the session. The organization's currency is immutable once any order or
 * invoice exists (currency lock).
 */
export type CurrencyCode =
  | 'USD'
  | 'EUR'
  | 'GBP'
  | 'EGP'
  | 'SAR'
  | 'AED'
  | 'KWD'
  | 'QAR'
  | 'JOD';

export const SUPPORTED_CURRENCIES: readonly CurrencyCode[] = [
  'USD',
  'EUR',
  'GBP',
  'EGP',
  'SAR',
  'AED',
  'KWD',
  'QAR',
  'JOD',
];

/** Registration default when no currency is supplied. */
export const DEFAULT_CURRENCY: CurrencyCode = 'USD';

export function isSupportedCurrency(code: string): code is CurrencyCode {
  return SUPPORTED_CURRENCIES.includes(code as CurrencyCode);
}
