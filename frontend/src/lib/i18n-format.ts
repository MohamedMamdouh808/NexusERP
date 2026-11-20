/**
 * Locale-aware date, number, percentage and currency formatting (Phase 6).
 *
 * The selected language picks the Intl locale: English formats as Western
 * numbers left-to-right, Arabic as Arabic-Indic digits right-to-left. Monetary
 * values are formatted through `Intl.NumberFormat` with the organization's own
 * ISO 4217 code (read from the session, never hard-coded) - the VALUE is
 * untouched: switching the language never changes a price, a total or a
 * calculation, only how it is written.
 *
 * Exact-decimal helpers (`formatDecimal`, `groupThousands`, …) in `./format`
 * remain the string-precise workhorses; these are the Intl layer for presentation.
 */

import { storedLanguage } from '../i18n';
import type { AppLanguage } from '../i18n';
import { useSession } from '../services/auth-session';

export function intlLocale(language: AppLanguage = storedLanguage()): string {
  return language === 'ar' ? 'ar' : 'en';
}

export function formatDateTime(iso: string, language: AppLanguage = storedLanguage()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(intlLocale(language), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function formatDate(iso: string, language: AppLanguage = storedLanguage()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(intlLocale(language), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export function formatNumber(value: number | string, language: AppLanguage = storedLanguage()): string {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(parsed)) return String(value);
  return new Intl.NumberFormat(intlLocale(language)).format(parsed);
}

export function formatPercent(
  ratio: number,
  maximumFractionDigits = 1,
  language: AppLanguage = storedLanguage(),
): string {
  return new Intl.NumberFormat(intlLocale(language), {
    style: 'percent',
    maximumFractionDigits,
  }).format(ratio);
}

/**
 * Formats an exact decimal string as money in the given currency, at the
 * requested number of fraction digits. The digits are NOT the locale's choice -
 * they follow the recorded precision (2 for whole amounts, 4 for unit prices),
 * so no digit is ever rounded away for the sake of the presentation.
 */
export function formatMoneyLocalized(
  value: string,
  currency: string,
  fractionDigits: 0 | 2 | 3 | 4 = 2,
  language: AppLanguage = storedLanguage(),
): string {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || currency.trim() === '') return String(value);
  return new Intl.NumberFormat(intlLocale(language), {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(parsed);
}

/** The ISO code the signed-in organization uses, USD when signed out or absent. */
export const FALLBACK_CURRENCY = 'USD';
export function useOrganizationCurrency(): string {
  const session = useSession();
  return session.status === 'signed-in' ? session.organization.currencyCode : FALLBACK_CURRENCY;
}
