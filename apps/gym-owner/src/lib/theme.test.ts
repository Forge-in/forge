import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_THEME,
  THEME_ATTRIBUTE,
  THEME_BROADCAST_KEY,
  THEME_COOKIE,
  THEME_SWITCH_LABEL,
  applyTheme,
  isTheme,
  readAppliedTheme,
  readDefaultTheme,
  readStoredTheme,
  readThemeCookie,
  subscribeToTheme,
} from './theme';

/**
 * The theme is a cookie the server reads, projected onto an attribute on
 * `<html>`. These tests pin the parts that break silently: the parser the
 * server and client share, the cookie actually being written, and the cross-tab
 * signal.
 */

function clearCookies() {
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`;
  }
}

beforeEach(() => {
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  clearCookies();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isTheme', () => {
  it('accepts the two declared themes', () => {
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('light')).toBe(true);
  });

  it.each(['Dark', 'sepia', '', null, undefined, 0, {}])('rejects %j', (value) => {
    expect(isTheme(value)).toBe(false);
  });
});

describe('the cookie name', () => {
  /**
   * Namespaced per surface. An owner who is also a platform operator would
   * otherwise have one preference silently drive both products.
   */
  it('is scoped to the owner console', () => {
    expect(THEME_COOKIE).toBe('wrath-owner-theme');
    expect(THEME_COOKIE).not.toBe('wrath-core-theme');
  });
});

describe('readThemeCookie', () => {
  /** The same parser runs against a request header and `document.cookie`. */
  it('finds the theme among other cookies', () => {
    expect(readThemeCookie(`forge_at=abc; ${THEME_COOKIE}=light; forge_rt=def`)).toBe('light');
  });

  it('reads a lone cookie', () => {
    expect(readThemeCookie(`${THEME_COOKIE}=light`)).toBe('light');
  });

  it('tolerates the spacing a real header uses', () => {
    expect(readThemeCookie(`a=1;${THEME_COOKIE}=light;b=2`)).toBe('light');
    expect(readThemeCookie(`  ${THEME_COOKIE}  =  light  `)).toBe('light');
  });

  it.each([null, undefined, '', 'other=light', `${THEME_COOKIE}=neon`, `${THEME_COOKIE}=`])(
    'falls back to the default for %j',
    (header) => {
      expect(readThemeCookie(header)).toBe(DEFAULT_THEME);
    },
  );

  /** A cookie whose name merely ends with ours must not match. */
  it('does not match a similarly-named cookie', () => {
    expect(readThemeCookie(`not-${THEME_COOKIE}=light`)).toBe(DEFAULT_THEME);
  });
});

describe('applyTheme', () => {
  it('writes the attribute and the cookie', () => {
    applyTheme('light');
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('light');
    expect(readThemeCookie(document.cookie)).toBe('light');
  });

  /** The cookie is what the server reads, so it has to be path-wide. */
  it('scopes the cookie to the whole site', () => {
    applyTheme('light');
    // jsdom exposes only name=value, so the write itself is asserted through a spy.
    const spy = vi.spyOn(document, 'cookie', 'set');
    applyTheme('dark');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Path=/'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('SameSite=Lax'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('Max-Age='));
  });

  it('mirrors the value to storage as a cross-tab signal', () => {
    applyTheme('light');
    expect(localStorage.getItem(THEME_BROADCAST_KEY)).toBe('light');
  });

  /** The switch must still work when the cross-tab mirror cannot be written. */
  it('applies the theme even when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => applyTheme('light')).not.toThrow();
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('light');
    expect(readThemeCookie(document.cookie)).toBe('light');
  });

  it('notifies subscribers, and stops once unsubscribed', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToTheme(listener);

    applyTheme('light');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    applyTheme('dark');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('reading the theme', () => {
  it('reads what is committed to the DOM', () => {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, 'light');
    expect(readAppliedTheme()).toBe('light');
  });

  it('falls back when the attribute holds something unknown', () => {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, 'neon');
    expect(readAppliedTheme()).toBe(DEFAULT_THEME);
  });

  it('prefers the cookie the server also read', () => {
    document.cookie = `${THEME_COOKIE}=light; Path=/`;
    expect(readStoredTheme()).toBe('light');
  });

  /** So the two can never disagree while a cookie write is in flight. */
  it('falls back to the DOM when no cookie is set', () => {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, 'light');
    expect(readStoredTheme()).toBe('light');
  });

  it('always reports the default as the plain server snapshot', () => {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, 'light');
    expect(readDefaultTheme()).toBe(DEFAULT_THEME);
  });
});

describe('another tab changing the theme', () => {
  it('adopts the new value, rewrites the cookie and notifies', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToTheme(listener);

    window.dispatchEvent(
      new StorageEvent('storage', { key: THEME_BROADCAST_KEY, newValue: 'light' }),
    );

    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe('light');
    expect(readThemeCookie(document.cookie)).toBe('light');
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('ignores an unrelated storage key', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToTheme(listener);

    window.dispatchEvent(new StorageEvent('storage', { key: 'something-else', newValue: 'x' }));

    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  /** `key === null` means storage was cleared wholesale. */
  it('resets to the default when storage is cleared', () => {
    applyTheme('light');
    const unsubscribe = subscribeToTheme(() => {});

    window.dispatchEvent(new StorageEvent('storage', { key: null, newValue: null }));

    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe(DEFAULT_THEME);
    unsubscribe();
  });
});

describe('THEME_SWITCH_LABEL', () => {
  /** The switch names the theme you would move TO, which is what it does. */
  it('names the opposite theme', () => {
    expect(THEME_SWITCH_LABEL.dark).toBe('Ivory');
    expect(THEME_SWITCH_LABEL.light).toBe('Obsidian');
  });
});
