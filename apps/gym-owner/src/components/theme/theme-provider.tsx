'use client';

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import {
  applyTheme,
  readAppliedTheme,
  readStoredTheme,
  subscribeToTheme,
  type Theme,
} from '@/lib/theme';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  initialTheme,
  children,
}: {
  /**
   * The theme the server rendered `<html>` with.
   *
   * Passed in rather than re-derived so the hydration snapshot is EXACTLY what
   * the markup says. A store that read the cookie during hydration could return
   * a different value from the one the HTML was built with, which is the
   * mismatch this whole design exists to avoid.
   */
  initialTheme: Theme;
  children: React.ReactNode;
}) {
  const serverSnapshot = useCallback(() => initialTheme, [initialTheme]);

  /**
   * The live theme is a cookie plus an attribute on `<html>`, and another tab
   * can change both underneath us — an external store, not React state.
   */
  const theme = useSyncExternalStore(subscribeToTheme, readStoredTheme, serverSnapshot);

  const setTheme = useCallback((next: Theme) => applyTheme(next), []);

  /**
   * Reads the DOM rather than closing over `theme`. Two clicks in the same tick
   * would both see the same stale value and toggle to the same target — the
   * attribute has already moved on.
   */
  const toggleTheme = useCallback(
    () => applyTheme(readAppliedTheme() === 'dark' ? 'light' : 'dark'),
    [],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>');
  return context;
}
