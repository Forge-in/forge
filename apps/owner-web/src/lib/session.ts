import { cookies } from 'next/headers';

/**
 * Session tokens, in httpOnly cookies — never in localStorage and never in JavaScript.
 *
 * This is the BFF pattern, and the reason for it is XSS. A token in localStorage is readable
 * by any script that ends up on the page: one compromised dependency, one injected analytics
 * snippet, and an attacker walks away with a 30-day refresh token. An httpOnly cookie is not
 * reachable from JavaScript at all, so the same XSS can make requests as the user but cannot
 * steal the credential and use it later from somewhere else.
 *
 * The browser therefore holds nothing. It calls /api/... on its own origin, and the route
 * handler attaches the bearer token server-side.
 *
 * The second benefit is that there is no CORS on the web path at all: same-origin requests to
 * a Next route handler never preflight, so a misconfigured allowlist cannot break the
 * dashboards.
 */

const ACCESS_COOKIE = 'forge_at';
const REFRESH_COOKIE = 'forge_rt';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Read result. Explicitly `| undefined` rather than Partial<> because
 * exactOptionalPropertyTypes distinguishes "key absent" from "key present holding undefined",
 * and a cookie lookup produces the latter.
 */
export interface MaybeSessionTokens {
  accessToken: string | undefined;
  refreshToken: string | undefined;
}

/** Shared cookie attributes. Getting any of these wrong is the whole point of the pattern. */
function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    // Plain http on localhost would otherwise drop the cookie entirely in development.
    secure: process.env.NODE_ENV === 'production',
    /**
     * 'lax', not 'none': the dashboards never need the cookie on a cross-site request, and
     * 'none' would send it on any third-party navigation, which is the CSRF exposure this
     * attribute exists to close. 'strict' is avoided only because it drops the cookie on an
     * inbound link, which would log a user out when they click through from an email.
     */
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

export async function readSession(): Promise<MaybeSessionTokens> {
  const store = await cookies();
  return {
    accessToken: store.get(ACCESS_COOKIE)?.value,
    refreshToken: store.get(REFRESH_COOKIE)?.value,
  };
}

/**
 * Access and refresh get DIFFERENT lifetimes, matching the tokens themselves.
 *
 * A refresh cookie that expired with the access token would force a fresh sign-in every
 * fifteen minutes; an access cookie living for thirty days would keep presenting a token the
 * API has long since stopped accepting, producing a 401 on every request with no obvious
 * cause.
 */
export async function writeSession(tokens: SessionTokens): Promise<void> {
  const store = await cookies();
  store.set(ACCESS_COOKIE, tokens.accessToken, cookieOptions(60 * 60));
  store.set(REFRESH_COOKIE, tokens.refreshToken, cookieOptions(60 * 60 * 24 * 30));
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

export { ACCESS_COOKIE, REFRESH_COOKIE };
