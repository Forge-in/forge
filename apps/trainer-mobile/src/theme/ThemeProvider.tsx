/**
 * Theme context.
 *
 * Replaces the design's `document.documentElement.setAttribute('data-trainer-theme', ...)`
 * with a React context, since React Native has no document to hang an attribute on.
 *
 * `ready` exists because reading the stored preference is asynchronous here where the
 * browser's `localStorage` was synchronous. Rendering before it resolves would paint the
 * default theme and then snap to the stored one — so App holds the splash screen until both
 * this and the fonts are settled.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { palettes, shadows, type Palette, type Shadows, type ThemeName } from './tokens';
import { readStoredTheme, writeStoredTheme } from './theme-storage';

export interface ThemeContextValue {
  name: ThemeName;
  colors: Palette;
  shadow: Shadows;
  /** True once the stored preference has been read (or definitively failed to read). */
  ready: boolean;
  /** Label for the toggle control — it names the theme it will switch *to*. */
  toggleLabel: string;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * The design opens in dark and only ever leaves it on an explicit tap; the system colour
 * scheme is deliberately not consulted. Gold-on-obsidian is the product's identity, not a
 * preference, and the toggle is right there in the header for anyone who wants otherwise.
 */
export const DEFAULT_THEME: ThemeName = 'dark';

export function ThemeProvider({
  children,
  /** Test seam: skips the async read so tests render at a known theme immediately. */
  initialTheme,
}: {
  children: ReactNode;
  initialTheme?: ThemeName;
}) {
  const [name, setName] = useState<ThemeName>(initialTheme ?? DEFAULT_THEME);
  const [ready, setReady] = useState(initialTheme !== undefined);

  useEffect(() => {
    if (initialTheme !== undefined) return;
    let cancelled = false;
    void readStoredTheme().then((stored) => {
      if (cancelled) return;
      if (stored) setName(stored);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [initialTheme]);

  const toggleTheme = useCallback(() => {
    setName((current) => {
      const next: ThemeName = current === 'light' ? 'dark' : 'light';
      void writeStoredTheme(next);
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const colors = palettes[name];
    return {
      name,
      colors,
      shadow: shadows(colors),
      ready,
      toggleLabel: name === 'dark' ? 'Light' : 'Dark',
      toggleTheme,
    };
  }, [name, ready, toggleTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside a <ThemeProvider>');
  return value;
}

/**
 * Builds themed styles once per theme change.
 *
 * `StyleSheet.create` cannot hold colours that vary at runtime, so every screen pairs a
 * static sheet with a factory passed through this hook.
 */
export function useThemedStyles<T>(factory: (theme: ThemeContextValue) => T): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [factory, theme]);
}
