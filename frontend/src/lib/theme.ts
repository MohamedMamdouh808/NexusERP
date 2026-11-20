/**
 * Browser-local appearance preferences: the theme and the density.
 *
 * Theme is a local preference stored in the browser and never sent to the
 * server. The LANGUAGE is a different key, owned by the i18n module
 * (`nexuserp_language`) - direction follows the language there, and only
 * there.
 */
export type ThemePreference = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact';

const THEME_KEY = 'nexuserp-theme';
const DENSITY_KEY = 'nexuserp-density';

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function storedTheme(): ThemePreference {
  const value = storage()?.getItem(THEME_KEY);
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export function storedDensity(): Density {
  return storage()?.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable';
}

export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light';
}

export function applyTheme(preference: ThemePreference, root: HTMLElement = document.documentElement): 'light' | 'dark' {
  const resolved = resolveTheme(preference);
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  return resolved;
}

export function applyDensity(density: Density, root: HTMLElement = document.documentElement): void {
  root.dataset.density = density;
}

export function setTheme(preference: ThemePreference): 'light' | 'dark' {
  storage()?.setItem(THEME_KEY, preference);
  return applyTheme(preference);
}

export function setDensity(density: Density): void {
  storage()?.setItem(DENSITY_KEY, density);
  applyDensity(density);
}

/**
 * Applies the stored theme and density before React renders, so the first
 * paint matches the preference instead of flashing. The language is restored
 * by the i18n module (`restoreLanguage`), which owns `dir` and `lang`.
 */
export function restorePreferences(): { theme: ThemePreference; density: Density } {
  const preference = storedTheme();
  const density = storedDensity();
  applyTheme(preference);
  applyDensity(density);
  return { theme: preference, density };
}
