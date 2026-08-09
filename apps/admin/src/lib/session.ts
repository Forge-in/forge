/**
 * Console session.
 *
 * The design's sign-in screen simply flips a flag, and there is no auth API yet.
 * This module is that flag, stored in a cookie rather than `localStorage` for one
 * reason: the cookie is readable in `proxy.ts`, so the redirect happens at the
 * edge and the console never flashes before bouncing an unauthenticated visitor.
 *
 * It is NOT a credential. When the API lands, `signIn` posts to it and stores the
 * real token; `proxy.ts` keeps working unchanged because it only asks "is there a
 * session cookie?" — the route handlers do the verifying.
 */

export const SESSION_COOKIE = 'wc_session';

/** Seven days, matching the "stay signed in" expectation for an ops console. */
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export interface ConsoleUser {
  name: string;
  email: string;
  role: string;
}

/** The signed-in operator. Replace with the decoded token once auth is real. */
export const CURRENT_USER: ConsoleUser = {
  name: 'S. Rathore',
  email: 'sameer@wrathfitness.com',
  role: 'Superadmin',
};

export function writeSessionCookie(): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${SESSION_COOKIE}=1; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

export function clearSessionCookie(): void {
  if (typeof document === 'undefined') return;
  // Mirrors the attributes used when writing it. Deletion matches on name, path
  // and domain, but keeping them in step avoids a stray duplicate cookie.
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}
