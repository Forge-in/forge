export const THEMES = ['dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = 'dark';

/**
 * The preference lives in a COOKIE, not in localStorage.
 *
 * This is the one decision in the theming system that matters, and it was
 * arrived at the hard way. localStorage is invisible to the server, so the
 * server had to render a default and a pre-paint script had to correct it. That
 * works right up until hydration: React 19 reconciles `<html>` and STRIPS
 * attributes it did not itself render, so the script's correction was wiped and
 * then re-applied by an effect — a measured one-frame dark flash on every full
 * page load for anyone using the light theme, and `suppressHydrationWarning`
 * hides the warning about it rather than preventing it.
 *
 * A cookie is sent with the request, so the server renders the RIGHT attribute
 * first time. React's output matches the DOM, nothing is stripped, nothing
 * flashes, and no bootstrap script is needed at all.
 *
 * Namespaced per surface: `wrath-core-theme` belongs to the platform console,
 * and an owner who is also an operator must not have one preference silently
 * drive both products.
 */
export const THEME_COOKIE = 'wrath-owner-theme';
export const THEME_ATTRIBUTE = 'data-owner-theme';

/** A year. The preference is not sensitive and should outlive a browser restart. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Mirrored into localStorage purely as a CROSS-TAB SIGNAL.
 *
 * Cookies fire no event when they change, so a second tab would keep its old
 * palette until reloaded. Writing the same value to storage lets the `storage`
 * event carry the change across tabs. Nothing ever reads this as the truth.
 */
export const THEME_BROADCAST_KEY = 'wrath-owner-theme';

/** The label the top-bar switch shows: it names the theme you would switch TO. */
export const THEME_SWITCH_LABEL: Readonly<Record<Theme, string>> = {
  dark: 'Ivory',
  light: 'Obsidian',
};

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/**
 * Pulls the theme out of a raw Cookie header or `document.cookie`.
 *
 * Written as a pure string parser so it can be used on both sides and tested
 * without a browser or a request.
 */
export function readThemeCookie(cookieHeader: string | null | undefined): Theme {
  if (!cookieHeader) return DEFAULT_THEME;

  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rest] = part.split('=');
    if (rawName?.trim() !== THEME_COOKIE) continue;
    const value = decodeURIComponent(rest.join('=').trim());
    return isTheme(value) ? value : DEFAULT_THEME;
  }

  return DEFAULT_THEME;
}

/* -------------------------------------------------------------------------- */
/* Theme as an external store                                                 */
/*                                                                            */
/* The live theme is not React state — it is a cookie plus an attribute on     */
/* <html>, and another tab can change both underneath us. Modelling it as an   */
/* external store and reading it with `useSyncExternalStore` is what keeps     */
/* React and the DOM from disagreeing.                                        */
/* -------------------------------------------------------------------------- */

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent): void {
  // `key === null` means storage was cleared wholesale.
  if (event.key !== null && event.key !== THEME_BROADCAST_KEY) return;

  const next = isTheme(event.newValue) ? event.newValue : DEFAULT_THEME;
  writeThemeCookie(next);
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

/** Reads the theme currently committed to the DOM. */
export function readAppliedTheme(): Theme {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  const applied = document.documentElement.getAttribute(THEME_ATTRIBUTE);
  return isTheme(applied) ? applied : DEFAULT_THEME;
}

/**
 * The stored preference, read from the cookie the server also read.
 *
 * Falls back to the DOM so the two can never disagree during the window in
 * which a cookie write has not yet landed.
 */
export function readStoredTheme(): Theme {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  const fromCookie = readThemeCookie(document.cookie);
  return fromCookie === DEFAULT_THEME ? readAppliedTheme() : fromCookie;
}

/** Server and hydration snapshot — always the documented default. */
export function readDefaultTheme(): Theme {
  return DEFAULT_THEME;
}

function writeThemeCookie(theme: Theme): void {
  /*
   * `SameSite=Lax` and no `Secure` in development, matching the session
   * cookies. Not `HttpOnly`: this one is written by the browser, and it carries
   * a colour preference rather than a credential.
   */
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=${THEME_COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;

  document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
  writeThemeCookie(theme);

  try {
    // The cross-tab signal. A failure here costs only cross-tab sync, so it is
    // swallowed rather than allowed to break the theme switch itself.
    localStorage.setItem(THEME_BROADCAST_KEY, theme);
  } catch {
    // Storage is unavailable (private mode, blocked cookies).
  }

  notify();
}
