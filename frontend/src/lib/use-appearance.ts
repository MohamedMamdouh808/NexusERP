import { useEffect, useState } from 'react';
import {
  applyDensity,
  applyDirection,
  applyTheme,
  restorePreferences,
  setDensity,
  setDirection,
  setTheme,
  type Density,
  type Direction,
  type ThemePreference,
} from './theme';

export function useAppearance() {
  const [restored] = useState(() => restorePreferences());
  const [preference, setPreference] = useState(restored.theme);
  const [density, setDensityState] = useState<Density>(restored.density);
  const [direction, setDirectionState] = useState<Direction>(restored.direction);
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
  const switchDirection = (next: Direction) => {
    setDirectionState(next);
    setDirection(next);
    applyDirection(next);
  };

  return { preference, resolved, density, direction, theme, compact, switchDirection };
}
