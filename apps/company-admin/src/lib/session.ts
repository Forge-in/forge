import 'server-only';

import { cookies } from 'next/headers';

import { ACCESS_COOKIE, REFRESH_COOKIE } from './session-cookies';

/**
 * Console session tokens, in httpOnly cookies — never in localStorage and never reachable
 * from JavaScript.
 *
 * This replaces the `wc_session=1` flag the console shipped with, which was a boolean
 * anyone could set from the browser console. It was honest about being a placeholder; it is
 * worth being precise about why the replacement is shaped the way it is.
 *
 * XSS IS THE THREAT. A token in localStorage is readable by any script that ends up on the
 * page: one compromised dependency, one injected snippet. For the member apps that costs a
 * gym member's session. For this console it costs every tenant on the platform. An httpOnly
 * cookie is not reachable from JavaScript at all, so the same XSS can act as the
 * administrator while the page is open but cannot steal the credential and use it later
 * from somewhere else.
 *
 * The browser therefore holds nothing. Server actions and server components attach the
 * bearer token server-side.
 *
 * `server-only` makes the boundary a BUILD error rather than a code review question: an
 * import of this module from a client component fails to compile.
 */

/**
 * The names live in `session-cookies.ts` — a leaf module with no imports — because
 * `proxy.ts` needs them too and must not depend on render-time modules. They are
 * deliberately DISTINCT from the gym owner dashboard's `forge_at` / `forge_rt`: if the two
 * apps are ever served from the same parent domain, shared names mean signing into one
 * silently overwrites the other's session, and the console's cookie would travel to the
 * member dashboard's origin.
 */

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Explicitly `| undefined` rather than Partial<>, because exactOptionalPropertyTypes
 * distinguishes "key absent" from "key present holding undefined", and a cookie lookup
 * produces the latter.
 */
export interface MaybeSessionTokens {
  accessToken: string | undefined;
  refreshToken: string | undefined;
}

/** Shared attributes. Getting any one of these wrong is the whole point of the pattern. */
function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    // Plain http on localhost would otherwise drop the cookie entirely in development.
    secure: process.env.NODE_ENV === 'production',
    /**
     * 'strict', not the member dashboard's 'lax'.
     *
     * The gym owner dashboard uses 'lax' so that clicking through from an email does not
     * land on a logged-out screen. This console has no inbound links worth preserving —
     * administrators navigate to it deliberately — so the friction costs nothing, while
     * 'strict' removes even the narrow top-level-navigation CSRF surface that 'lax' leaves
     * open. On the surface that can suspend a gym, that trade goes the other way.
     */
    sameSite: 'strict' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

/**
 * Cookie lifetimes mirror the TOKEN lifetimes on the API (JWT_CONSOLE_*), not the member
 * app's.
 *
 * A refresh cookie outliving its token would keep presenting a credential the API stopped
 * accepting hours ago, producing a 401 on every request with no obvious cause. One that
 * expired early would sign an administrator out mid-task for no reason.
 */
const ACCESS_COOKIE_MAX_AGE = 60 * 60; // an hour; the token itself lives 15 minutes
const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 12; // 12 hours, matching JWT_CONSOLE_REFRESH_TTL

export async function readSession(): Promise<MaybeSessionTokens> {
  const store = await cookies();
  return {
    accessToken: store.get(ACCESS_COOKIE)?.value,
    refreshToken: store.get(REFRESH_COOKIE)?.value,
  };
}

export async function writeSession(tokens: SessionTokens): Promise<void> {
  const store = await cookies();
  store.set(ACCESS_COOKIE, tokens.accessToken, cookieOptions(ACCESS_COOKIE_MAX_AGE));
  store.set(REFRESH_COOKIE, tokens.refreshToken, cookieOptions(REFRESH_COOKIE_MAX_AGE));
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

export { ACCESS_COOKIE, REFRESH_COOKIE };
