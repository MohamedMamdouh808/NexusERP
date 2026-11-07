export type ThemePreference = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact';
export type Direction = 'ltr' | 'rtl';

const THEME_KEY = 'nexuserp-theme';
const DENSITY_KEY = 'nexuserp-density';
const DIRECTION_KEY = 'nexuserp-direction';

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

export function storedDirection(): Direction {
  return storage()?.getItem(DIRECTION_KEY) === 'rtl' ? 'rtl' : 'ltr';
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

export function applyDirection(direction: Direction, root: HTMLElement = document.documentElement): void {
  root.dataset.direction = direction;
  root.dir = direction;
}

export function setTheme(preference: ThemePreference): 'light' | 'dark' {
  storage()?.setItem(THEME_KEY, preference);
  return applyTheme(preference);
}

export function setDensity(density: Density): void {
  storage()?.setItem(DENSITY_KEY, density);
  applyDensity(density);
}

export function setDirection(direction: Direction): void {
  storage()?.setItem(DIRECTION_KEY, direction);
  applyDirection(direction);
}

export function restorePreferences(): { theme: ThemePreference; density: Density; direction: Direction } {
  const preference = storedTheme();
  const density = storedDensity();
  const direction = storedDirection();
  applyTheme(preference);
  applyDensity(density);
  applyDirection(direction);
  return { theme: preference, density, direction };
}
