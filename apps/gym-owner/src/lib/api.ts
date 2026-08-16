import { ForgeApiClient, type TokenStore } from '@forge/api-client';

import { clearSession, readSession, writeSession } from './session';

/**
 * Server-side API client for gym-owner.
 *
 * SERVER ONLY. It reads httpOnly cookies, which do not exist in the browser — importing this
 * from a client component would fail at build time, which is the desired outcome: the browser
 * must never hold a token.
 *
 * API_URL is deliberately NOT prefixed with NEXT_PUBLIC. A NEXT_PUBLIC_ variable is inlined
 * into the client bundle, and the API's internal address is not something to publish. The
 * browser only ever talks to this app's own /api route.
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

/** Reads and writes the session cookies, so a refresh performed here persists. */
const cookieBackedStore: TokenStore = {
  getAccessToken: async () => (await readSession()).accessToken,
  getRefreshToken: async () => (await readSession()).refreshToken,
  setTokens: writeSession,
  clear: clearSession,
};

/**
 * Built per request, not once at module scope.
 *
 * A module-level singleton would capture one request's cookies and hand them to every other
 * request the server handles — one user's session serving another's page. The same class of
 * bug as reusing a database connection with a tenant already pinned to it.
 */
export function serverApi(): ForgeApiClient {
  return new ForgeApiClient({
    baseUrl: `${apiUrl()}/api`,
    tokenStore: cookieBackedStore,
    client: {
      app: 'gym-owner',
      version: process.env.APP_VERSION ?? '0.1.0',
      platform: 'web',
    },
  });
}
