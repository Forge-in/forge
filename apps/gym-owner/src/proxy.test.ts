import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { CONSOLE_HOME } from './lib/navigation';
import { config, proxy } from './proxy';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './lib/session-cookies';

const ORIGIN = 'https://owner.wrathfitness.com';

function request(path: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(new URL(path, ORIGIN));
  for (const [name, value] of Object.entries(cookies)) req.cookies.set(name, value);
  return req;
}

const SIGNED_IN = { [REFRESH_COOKIE]: 'rt' };

function location(response: Response | undefined): string | null {
  const raw = response?.headers.get('location');
  return raw ? new URL(raw).pathname + new URL(raw).search : null;
}

describe('proxy', () => {
  describe('the root', () => {
    it('sends a signed-in owner to the console', () => {
      expect(location(proxy(request('/', SIGNED_IN)))).toBe(CONSOLE_HOME);
    });

    it('sends a visitor with no session to sign in', () => {
      expect(location(proxy(request('/')))).toBe('/login');
    });
  });

  describe('without a session', () => {
    it.each(['/overview', '/members', '/fees', '/settings'])(
      'redirects %s to the login screen',
      (path) => {
        expect(location(proxy(request(path)))?.startsWith('/login')).toBe(true);
      },
    );

    it('remembers where the visitor was headed, query string and all', () => {
      const target = location(proxy(request('/members?status=Overdue')));
      expect(target).toBe('/login?next=%2Fmembers%3Fstatus%3DOverdue');
    });

    it('lets the login screen itself through', () => {
      expect(location(proxy(request('/login')))).toBeNull();
    });
  });

  describe('with a session', () => {
    it('lets console routes through untouched', () => {
      expect(location(proxy(request('/overview', SIGNED_IN)))).toBeNull();
    });

    it('bounces a signed-in owner away from the login screen', () => {
      expect(location(proxy(request('/login', SIGNED_IN)))).toBe(CONSOLE_HOME);
    });
  });

  /**
   * The access token lives an hour; the session lives thirty days and renews
   * itself server-side. Gating on the access cookie would bounce an owner to a
   * fresh SMS every time they came back from the floor, while a perfectly good
   * session sat unused.
   */
  describe('which cookie it gates on', () => {
    it('treats a refresh cookie alone as signed in', () => {
      expect(location(proxy(request('/overview', { [REFRESH_COOKIE]: 'rt' })))).toBeNull();
    });

    it('treats an access cookie alone as signed out', () => {
      const target = location(proxy(request('/overview', { [ACCESS_COOKIE]: 'at' })));
      expect(target?.startsWith('/login')).toBe(true);
    });
  });

  /**
   * The gate runs on every matched request, so pulling static assets out of it
   * is a real cost saving — and an auth redirect on a stylesheet request breaks
   * the page rather than protecting it.
   */
  describe('the matcher', () => {
    const pattern = new RegExp(`^${String(config.matcher[0])}$`);

    it.each(['/_next/static/chunk.js', '/_next/image', '/favicon.ico', '/mark.svg', '/hero.png'])(
      'excludes %s',
      (path) => {
        expect(pattern.test(path)).toBe(false);
      },
    );

    it.each(['/', '/overview', '/members', '/login'])('includes %s', (path) => {
      expect(pattern.test(path)).toBe(true);
    });
  });
});
