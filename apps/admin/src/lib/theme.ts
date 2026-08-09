export const THEMES = ['dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = 'dark';
export const THEME_STORAGE_KEY = 'wrath-core-theme';
export const THEME_ATTRIBUTE = 'data-theme';

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/**
 * Runs before first paint, inlined at the top of <body>, so the correct palette
 * is on the <html> element before the browser paints anything. Without it every
 * reload flashes the default theme.
 *
 * Written defensively: storage access throws in some privacy modes, and the whole
 * thing is wrapped so a failure can never block hydration.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t!=="dark"&&t!=="light"){t=${JSON.stringify(
  DEFAULT_THEME,
)};}document.documentElement.setAttribute(${JSON.stringify(
  THEME_ATTRIBUTE,
)},t);}catch(e){document.documentElement.setAttribute(${JSON.stringify(
  THEME_ATTRIBUTE,
)},${JSON.stringify(DEFAULT_THEME)});}})();`;

/* -------------------------------------------------------------------------- */
/* Theme as an external store                                                 */
/*                                                                            */
/* The live theme is not React state — it is an attribute on <html> that a     */
/* pre-paint script sets before React exists, and that another tab can change  */
/* underneath us. Modelling it as an external store and reading it with        */
/* `useSyncExternalStore` is what keeps React and the DOM from disagreeing.    */
/* -------------------------------------------------------------------------- */

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent): void {
  // `key === null` means storage was cleared wholesale.
  if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;

  const next = isTheme(event.newValue) ? event.newValue : DEFAULT_THEME;
  document.documentElement.setAttribute(THEME_ATTRIBUTE, next);
  notify();
}

export function subscribeToTheme(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener('storage', onStorage);
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

/** Reads the theme the init script committed to the DOM. */
export function readAppliedTheme(): Theme {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  const applied = document.documentElement.getAttribute(THEME_ATTRIBUTE);
  return isTheme(applied) ? applied : DEFAULT_THEME;
}

/** Server and hydration snapshot — always the documented default. */
export function readDefaultTheme(): Theme {
  return DEFAULT_THEME;
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;

  document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage is unavailable (private mode, blocked cookies). The theme still
    // applies for this session; it just will not survive a reload.
  }

  notify();
}
