import { NextResponse, type NextRequest } from 'next/server';

import { CONSOLE_HOME } from '@/lib/navigation';
import { REFRESH_COOKIE } from '@/lib/session-cookies';

/**
 * Optimistic gate for the owner dashboard.
 *
 * Runs before anything renders, so an unauthenticated visitor is redirected to
 * `/login` without the console ever painting, and a signed-in owner never sees
 * the login screen again.
 *
 * WHAT THIS IS NOT: authorization. It reads a cookie and nothing else — no
 * token verification, no API call, no database. That is deliberate and it is
 * what Next.js prescribes: the proxy runs on EVERY request including
 * prefetches, so anything expensive here multiplies across the whole app, and
 * anything security-critical here is being enforced at the wrong layer.
 *
 * The real check is `requireOwner()` in `lib/dal.ts`, which asks the API to
 * verify the signature, consult the revocation list and re-read the membership.
 * Someone who forges this cookie gets past this file and is stopped there — one
 * redirect later, having seen nothing.
 *
 * IT GATES ON THE REFRESH COOKIE, NOT THE ACCESS COOKIE. The access token lives
 * an hour; the refresh cookie lives thirty days and renews the session
 * server-side. Gating on the access cookie would bounce an owner to a sign-in
 * screen — and a fresh SMS — every time they came back from the floor, while a
 * perfectly good session sat unused.
 */

const PUBLIC_PATHS = new Set(['/login']);

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const signedIn = request.cookies.has(REFRESH_COOKIE);
  const isPublic = PUBLIC_PATHS.has(pathname);

  if (pathname === '/') {
    return NextResponse.redirect(new URL(signedIn ? CONSOLE_HOME : '/login', request.url));
  }

  if (!signedIn && !isPublic) {
    const login = new URL('/login', request.url);
    /**
     * Remember where they were headed so sign-in can return them there. Read
     * back through `safeDestination()`, which rejects anything that is not a
     * local path — otherwise this parameter is an open redirect with a login
     * screen attached.
     */
    login.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  if (signedIn && isPublic) {
    return NextResponse.redirect(new URL(CONSOLE_HOME, request.url));
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Everything except Next internals, the favicon and static assets. Keeping
   * assets out matters: the gate runs on every matched request.
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
