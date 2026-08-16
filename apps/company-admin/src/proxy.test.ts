import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { config, proxy } from './proxy';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './lib/session-cookies';

/**
 * The console's edge gate.
 *
 * It is an OPTIMISTIC check by design — it reads a cookie name and nothing else, and the
 * real verification happens in `lib/dal.ts`. What these tests pin is the behaviour that
 * would otherwise break silently:
 *
 *   - gating on the REFRESH cookie, not the access one, or administrators get bounced to an
 *     SMS every fifteen minutes while a perfectly good session sits unused;
 *   - the `?next=` parameter never becoming an open redirect;
 *   - the matcher not swallowing static assets, which would make the gate run on every
 *     image request.
 */

function requestFor(path: string, cookies: Record<string, string> = {}): NextRequest {
  const request = new NextRequest(new URL(path, 'https://console.forge.test'));
  for (const [name, value] of Object.entries(cookies)) {
    request.cookies.set(name, value);
  }
  return request;
}

const signedIn = { [REFRESH_COOKIE]: 'refresh-token-value' };

describe('unauthenticated visitors', () => {
  it('redirects a console route to the login screen', () => {
    const response = proxy(requestFor('/gyms'));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location')!).pathname).toBe('/login');
  });

  it('remembers where they were headed', () => {
    const response = proxy(requestFor('/gyms?status=active'));
    const location = new URL(response.headers.get('location')!);

    expect(location.searchParams.get('next')).toBe('/gyms?status=active');
  });

  it('leaves the login screen alone', () => {
    const response = proxy(requestFor('/login'));
    expect(response.headers.get('location')).toBeNull();
  });

  it('sends the root to the login screen', () => {
    const response = proxy(requestFor('/'));
    expect(new URL(response.headers.get('location')!).pathname).toBe('/login');
  });
});

describe('signed-in administrators', () => {
  it('lets a console route through', () => {
    const response = proxy(requestFor('/gyms', signedIn));
    expect(response.headers.get('location')).toBeNull();
  });

  it('sends the root to the console home', () => {
    const response = proxy(requestFor('/', signedIn));
    expect(new URL(response.headers.get('location')!).pathname).toBe('/overview');
  });

  it('keeps them off the login screen', () => {
    const response = proxy(requestFor('/login', signedIn));
    expect(new URL(response.headers.get('location')!).pathname).toBe('/overview');
  });
});

/**
 * The access token lives fifteen minutes; the session lives twelve hours and renews itself
 * server-side. Gating on the access cookie would sign an administrator out every time they
 * came back from lunch — and since sign-in needs an SMS, that is a real interruption rather
 * than a click.
 */
describe('which cookie decides', () => {
  it('treats a live refresh cookie as signed in even with no access cookie', () => {
    const response = proxy(requestFor('/gyms', signedIn));
    expect(response.headers.get('location')).toBeNull();
  });

  it('treats an access cookie alone as signed OUT', () => {
    // Cannot happen in normal use — both are written together — but if it ever did, the
    // access token is the shorter-lived of the two and cannot renew itself.
    const response = proxy(requestFor('/gyms', { [ACCESS_COOKIE]: 'access-token-value' }));
    expect(new URL(response.headers.get('location')!).pathname).toBe('/login');
  });
});

describe('the matcher', () => {
  /**
   * The gate runs on every matched request, so pulling static assets out of it is a real
   * cost saving — and an auth redirect on a stylesheet request breaks the page rather than
   * protecting it.
   */
  it.each(['/_next/static/chunk.js', '/_next/image', '/favicon.ico', '/logo.svg', '/hero.png'])(
    'excludes %s',
    (path) => {
      const pattern = new RegExp(`^${String(config.matcher[0])}$`);
      expect(pattern.test(path)).toBe(false);
    },
  );

  it.each(['/overview', '/gyms/abc', '/login'])('includes %s', (path) => {
    const pattern = new RegExp(`^${String(config.matcher[0])}$`);
    expect(pattern.test(path)).toBe(true);
  });
});
