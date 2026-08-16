'use client';

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import {
  applyTheme,
  readAppliedTheme,
  readDefaultTheme,
  subscribeToTheme,
  type Theme,
} from '@/lib/theme';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The <html> attribute is the source of truth: the pre-paint script writes it
  // before React runs, and another tab can change it while we are open.
  const theme = useSyncExternalStore(subscribeToTheme, readAppliedTheme, readDefaultTheme);

  const setTheme = useCallback((next: Theme) => applyTheme(next), []);

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
