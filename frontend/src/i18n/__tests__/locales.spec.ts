import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import en from '../locales/en';
import ar from '../locales/ar';
import i18n, {
  isAppLanguage,
  restoreLanguage,
  setAppLanguage,
  storedLanguage,
  LANGUAGE_STORAGE_KEY,
} from '../index';

/** Flattens nested locale objects into dot-separated key lists. */
function flattenKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix.replace(/\.$/, '')];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    typeof child === 'object' && child !== null
      ? flattenKeys(child, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

/** The interpolation variables a string uses, sorted. */
function interpolationVars(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((match) => match[1]).sort();
}

function lookup(source: unknown, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>(
    (acc, part) => (typeof acc === 'object' && acc !== null ? (acc as Record<string, unknown>)[part] : undefined),
    source,
  );
}

describe('the locale resources stay in step', () => {
  it('English and Arabic carry exactly the same keys', () => {
    const enKeys = flattenKeys(en).sort();
    const arKeys = flattenKeys(ar).sort();
    expect(arKeys).toEqual(enKeys);
  });

  it('both resources carry the same interpolation variables per key', () => {
    for (const key of flattenKeys(en)) {
      const enValue = lookup(en, key);
      const arValue = lookup(ar, key);
      expect(typeof enValue, `en value ${key}`).toBe('string');
      expect(typeof arValue, `ar value ${key}`).toBe('string');
      expect(interpolationVars(arValue as string), key).toEqual(
        interpolationVars(enValue as string),
      );
    }
  });

  it('no translation value is empty', () => {
    for (const locale of [en, ar] as const) {
      for (const key of flattenKeys(locale)) {
        expect(String(lookup(locale, key)).trim().length, key).toBeGreaterThan(0);
      }
    }
  });
});

describe('language persistence', () => {
  beforeEach(() => {
    window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  });

  afterEach(async () => {
    await setAppLanguage('en');
    window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  });

  it('defaults to English when nothing is stored', () => {
    expect(storedLanguage()).toBe('en');
  });

  it('treats a stored garbage value as English, never as Arabic', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr');
    expect(storedLanguage()).toBe('en');
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, '');
    expect(storedLanguage()).toBe('en');
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'AR');
    expect(storedLanguage()).toBe('en');
  });

  it('isAppLanguage only admits the two supported codes', () => {
    expect(isAppLanguage('en')).toBe(true);
    expect(isAppLanguage('ar')).toBe(true);
    expect(isAppLanguage('fr')).toBe(false);
    expect(isAppLanguage(undefined)).toBe(false);
    expect(isAppLanguage(null)).toBe(false);
  });

  it('setAppLanguage applies the language, the direction and the html lang', async () => {
    await setAppLanguage('ar');
    expect(i18n.language).toBe('ar');
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.dataset.direction).toBe('rtl');
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('ar');

    await setAppLanguage('en');
    expect(i18n.language).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.dataset.direction).toBe('ltr');
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
  });

  it('restoreLanguage reads the stored value and applies it', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'ar');
    expect(restoreLanguage()).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });
});
