/**
 * Central localization configuration (feature 009).
 *
 * One i18next instance, programmed with inline resources - no network fetch,
 * so the first paint after a language switch carries the right strings, and a
 * page reload is never part of switching. The two supported languages are
 * English (LTR) and Arabic (RTL); the language is stored in localStorage under
 * the single key `nexuserp_language`, as 'en' or 'ar'. Anything else that key
 * may hold is treated as no preference and falls back to English.
 *
 * The direction of the document follows the language: English sets 'ltr',
 * Arabic sets 'rtl', and the HTML `lang` attribute follows it too. The stored
 * theme (`nexuserp-theme`) is a different key and is never touched here.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en';
import ar from './locales/ar';

export const LANGUAGE_STORAGE_KEY = 'nexuserp_language';
export const SUPPORTED_LANGUAGES = ['en', 'ar'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === 'en' || value === 'ar';
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The stored language, or English when there is no valid preference. */
export function storedLanguage(): AppLanguage {
  const value = storage()?.getItem(LANGUAGE_STORAGE_KEY);
  return isAppLanguage(value) ? value : 'en';
}

/** The layout direction a language uses. */
export function directionOf(language: AppLanguage): 'ltr' | 'rtl' {
  return language === 'ar' ? 'rtl' : 'ltr';
}

/** Writes the document attributes the CSS and the assistive technology read. */
function applyDocumentDirection(language: AppLanguage): void {
  const root = document.documentElement;
  root.lang = language;
  const direction = directionOf(language);
  root.dir = direction;
  root.dataset.direction = direction;
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: storedLanguage(),
  fallbackLng: 'en',
  initAsync: false,
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

export const i18nInstance = i18n;
export default i18n;

/**
 * Applies a stored preference before React renders, so the first paint
 * carries the chosen language and its direction - never a flash of English
 * followed by Arabic.
 */
export function restoreLanguage(): AppLanguage {
  const language = storedLanguage();
  applyDocumentDirection(language);
  return language;
}

/** Switches the language in place, persists it, and flips the direction. */
export async function setAppLanguage(language: AppLanguage): Promise<void> {
  if (!isAppLanguage(language)) return;
  storage()?.setItem(LANGUAGE_STORAGE_KEY, language);
  applyDocumentDirection(language);
  await i18n.changeLanguage(language);
}
