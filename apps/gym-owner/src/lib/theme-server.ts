import 'server-only';

import { cookies } from 'next/headers';

import { DEFAULT_THEME, THEME_COOKIE, isTheme, type Theme } from './theme';

/**
 * The owner's theme, read on the server so `<html>` is rendered with it.
 *
 * Split from `theme.ts` because that module is imported by client components
 * and `next/headers` cannot exist there. Keeping them apart is what makes the
 * one shared parser usable on both sides.
 *
 * Reading a cookie opts the route out of static rendering. That is the price of
 * a correct first paint, and it is small here: every console route is already
 * dynamic because it verifies a session, and the only static pages left are the
 * sign-in screen and the 404.
 */
export async function readThemePreference(): Promise<Theme> {
  const store = await cookies();
  const value = store.get(THEME_COOKIE)?.value;
  return isTheme(value) ? value : DEFAULT_THEME;
}
