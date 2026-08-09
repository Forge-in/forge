import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/session';

/**
 * Edge gate for the console.
 *
 * Runs before anything renders, so an unauthenticated visitor is redirected to
 * `/login` without the console ever painting, and a signed-in operator never sees
 * the login screen again.
 *
 * Presence of the cookie is all that is checked here — verification belongs in
 * the route handlers once the auth API exists (see `lib/session.ts`).
 */

const PUBLIC_PATHS = new Set(['/login']);
const HOME = '/overview';

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const signedIn = request.cookies.has(SESSION_COOKIE);
  const isPublic = PUBLIC_PATHS.has(pathname);

  if (pathname === '/') {
    return NextResponse.redirect(new URL(signedIn ? HOME : '/login', request.url));
  }

  if (!signedIn && !isPublic) {
    const login = new URL('/login', request.url);
    // Remember where they were headed so sign-in can return them there.
    login.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  if (signedIn && isPublic) {
    return NextResponse.redirect(new URL(HOME, request.url));
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
