import 'server-only';

import { ForgeConsoleClient, type TokenStore } from '@forge/api-client';

import { clearSession, readSession, writeSession } from './session';

/**
 * Server-side API client for the company admin console.
 *
 * SERVER ONLY, enforced by `server-only` rather than by convention: it reads httpOnly
 * cookies, which do not exist in the browser, so importing it from a client component is a
 * build error. That is the desired outcome — the browser must never hold a token that can
 * reach every tenant on the platform.
 *
 * API_URL is deliberately NOT prefixed with NEXT_PUBLIC. A NEXT_PUBLIC_ variable is inlined
 * into the client bundle, and the API's internal address is not something to publish.
 */
function apiUrl(): string {
  const url = process.env.API_URL;
  if (!url) {
    // Fails loudly at first use rather than producing requests to "undefined/v1/...", which
    // surface as a confusing fetch error far from the missing configuration.
    throw new Error('API_URL is not set. See .env.example.');
  }
  return url.replace(/\/$/, '');
}

/** Reads and writes the console session cookies, so a refresh performed here persists. */
const cookieBackedStore: TokenStore = {
  getAccessToken: async () => (await readSession()).accessToken,
  getRefreshToken: async () => (await readSession()).refreshToken,
  setTokens: writeSession,
  clear: clearSession,
};

/**
 * Built per request, never once at module scope.
 *
 * A module-level singleton would capture one request's cookies and hand them to every other
 * request the server handles — one administrator's session serving another's page. The same
 * class of bug as reusing a database connection with a tenant already pinned to it, and on
 * this surface the blast radius is the whole platform.
 */
export function consoleApi(): ForgeConsoleClient {
  return new ForgeConsoleClient({
    baseUrl: `${apiUrl()}/api`,
    tokenStore: cookieBackedStore,
    client: {
      app: 'company-admin',
      version: process.env.APP_VERSION ?? '0.1.0',
      platform: 'web',
    },
  });
}

/**
 * A client with NO token store, for the sign-in calls that happen before a session exists.
 *
 * Using the cookie-backed client for these would attempt a cookie write during a render
 * pass, which Next.js forbids outside a server action or route handler — and would attach a
 * stale bearer token to a request that is meant to be anonymous.
 */
export function anonymousConsoleApi(): ForgeConsoleClient {
  return new ForgeConsoleClient({
    baseUrl: `${apiUrl()}/api`,
    tokenStore: {
      getAccessToken: () => Promise.resolve(undefined),
      getRefreshToken: () => Promise.resolve(undefined),
      setTokens: () => Promise.resolve(),
      clear: () => Promise.resolve(),
    },
    client: {
      app: 'company-admin',
      version: process.env.APP_VERSION ?? '0.1.0',
      platform: 'web',
    },
  });
}
