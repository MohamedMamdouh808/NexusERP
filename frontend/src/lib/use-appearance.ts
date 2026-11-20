import { useEffect, useState } from 'react';
import {
  applyDensity,
  applyTheme,
  restorePreferences,
  setDensity,
  setTheme,
  type Density,
  type ThemePreference,
} from './theme';

/**
 * Theme and density in one hook. The language lives in the i18n module and is
 * read there - nothing here keeps a second copy of it.
 */
export function useAppearance() {
  const [restored] = useState(() => restorePreferences());
  const [preference, setPreference] = useState(restored.theme);
  const [density, setDensityState] = useState<Density>(restored.density);
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => applyTheme(restored.theme));

  useEffect(() => {
    const onSystemChange = () => {
      if (preference !== 'system') return;
      setResolved(applyTheme('system'));
    };
    const media = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener('change', onSystemChange);
    return () => media?.removeEventListener('change', onSystemChange);
  }, [preference]);

  const theme = (next: ThemePreference) => {
    setPreference(next);
    setResolved(setTheme(next));
  };
  const compact = (next: Density) => {
    setDensityState(next);
    setDensity(next);
    applyDensity(next);
  };

  return { preference, resolved, density, theme, compact };
}
