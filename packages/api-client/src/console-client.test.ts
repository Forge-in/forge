import { ErrorCode, type ErrorEnvelope } from '@forge/shared';
import { describe, expect, it, vi } from 'vitest';

import { ForgeApiClient } from './client.js';
import { ForgeConsoleClient } from './console-client.js';
import { memoryTokenStore } from './token-store.js';

/**
 * The console client shares its transport with the member client, so the timeouts, the
 * idempotency keys and the single-flight refresh are already covered by client.test.ts.
 *
 * What is NOT shared, and is therefore what these tests pin, is which endpoints it talks to.
 * Both mistakes available here are silent: pointing the console at the member refresh
 * endpoint produces a session that renews for fifteen minutes and then dies with no way
 * back, and putting a member method on this class produces a call that compiles, reads
 * sensibly, and 401s forever.
 */

const envelope = (code: ErrorCode, message = 'nope'): ErrorEnvelope => ({
  error: {
    code,
    message,
    retryable: false,
    requestId: 'req-1',
    timestamp: new Date().toISOString(),
  },
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': 'req-1' },
  });
}

function makeClient(fetchImpl: typeof fetch) {
  const tokenStore = memoryTokenStore({ accessToken: 'access-1', refreshToken: 'refresh-1' });

  const client = new ForgeConsoleClient({
    baseUrl: 'https://api.test',
    tokenStore,
    client: { app: 'company-admin', version: '0.1.0', platform: 'web' },
    fetchImpl,
  });

  return { client, tokenStore };
}

const pathsCalled = (fetchImpl: { mock: { calls: unknown[][] } }): string[] =>
  fetchImpl.mock.calls.map((call) => String(call[0]));

describe('endpoint routing', () => {
  it.each<[string, (c: ForgeConsoleClient) => Promise<unknown>]>([
    ['/v1/admin/auth/request-otp', (c) => c.requestOtp({ phone: '+919876543210' })],
    ['/v1/admin/auth/me', (c) => c.me()],
    ['/v1/admin/invites', (c) => c.listInvites()],
    ['/v1/admin/admins', (c) => c.listAdmins()],
  ])('sends %s under the admin prefix', async (path, call) => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    const { client } = makeClient(fetchImpl as unknown as typeof fetch);

    await call(client);

    expect(pathsCalled(fetchImpl)[0]).toBe(`https://api.test${path}`);
  });

  it('never reaches a member endpoint', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    const { client } = makeClient(fetchImpl as unknown as typeof fetch);

    await client.me();
    await client.listAdmins();

    // A console token presented to /v1/auth/* is rejected by the audience check, so any
    // path here without the admin prefix is a request that can only ever fail.
    for (const path of pathsCalled(fetchImpl)) {
      expect(path).toContain('/v1/admin/');
    }
  });

  /**
   * THE ONE THAT WOULD NOT SHOW UP IN A SMOKE TEST.
   *
   * A console session works perfectly until its access token expires. If the refresh went to
   * the member endpoint, the audience check rejects it, the client clears the tokens, and
   * the administrator is signed out — fifteen minutes after every sign-in, with nothing in
   * the UI to explain it.
   */
  it('refreshes against the ADMIN refresh endpoint, not the member one', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).endsWith('/v1/admin/auth/refresh')) {
        return jsonResponse({
          tokens: { accessToken: 'access-2', refreshToken: 'refresh-2', expiresInSeconds: 900 },
        });
      }
      // The first call presents an expired token; the replay after refresh succeeds.
      return fetchImpl.mock.calls.length > 2
        ? jsonResponse({ admin: { adminId: 'a' } })
        : jsonResponse(envelope(ErrorCode.TOKEN_EXPIRED), 401);
    });

    const { client, tokenStore } = makeClient(fetchImpl as unknown as typeof fetch);

    await client.me();

    expect(pathsCalled(fetchImpl)).toContain('https://api.test/v1/admin/auth/refresh');
    expect(pathsCalled(fetchImpl)).not.toContain('https://api.test/v1/auth/refresh');
    expect(await tokenStore.getAccessToken()).toBe('access-2');
  });
});

describe('session handling', () => {
  it('stores the tokens a successful sign-in returns', async () => {
    const tokens = { accessToken: 'new-a', refreshToken: 'new-r', expiresInSeconds: 900 };
    const fetchImpl = vi.fn(async () => jsonResponse({ tokens, admin: { adminId: 'a' } }));
    const { client, tokenStore } = makeClient(fetchImpl as unknown as typeof fetch);

    await client.verifyOtp({ phone: '+919876543210', otp: '123456' });

    expect(await tokenStore.getAccessToken()).toBe('new-a');
    expect(await tokenStore.getRefreshToken()).toBe('new-r');
  });

  it('stores the tokens an accepted invite returns', async () => {
    const tokens = { accessToken: 'inv-a', refreshToken: 'inv-r', expiresInSeconds: 900 };
    const fetchImpl = vi.fn(async () => jsonResponse({ tokens, admin: { adminId: 'a' } }));
    const { client, tokenStore } = makeClient(fetchImpl as unknown as typeof fetch);

    await client.acceptInvite({
      phone: '+919876543210',
      otp: '123456',
      inviteToken: 'x'.repeat(43),
    });

    expect(await tokenStore.getAccessToken()).toBe('inv-a');
  });

  /**
   * Pressing sign out on a shared machine must end the local session even when the API is
   * unreachable. Leaving the cookie behind because a network call failed is how a console
   * that can suspend a gym stays open on someone else's laptop.
   */
  it('clears the local session even when logout fails server-side', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(envelope(ErrorCode.INTERNAL), 500));
    const { client, tokenStore } = makeClient(fetchImpl as unknown as typeof fetch);

    await expect(client.logout()).rejects.toThrow();

    expect(await tokenStore.getAccessToken()).toBeUndefined();
    expect(await tokenStore.getRefreshToken()).toBeUndefined();
  });
});

describe('separation from the member client', () => {
  /**
   * Asserted structurally rather than by comment. If someone later makes ForgeConsoleClient
   * extend ForgeApiClient to "reuse a bit more", every member endpoint reappears on it and
   * this fails — which is the point at which to have the conversation, not after a call to
   * `switchStudio()` has shipped in the console.
   */
  it('does not inherit the member endpoints', () => {
    const consoleOnly = new ForgeConsoleClient({
      baseUrl: 'https://api.test',
      tokenStore: memoryTokenStore(),
      client: { app: 'company-admin', version: '0.1.0', platform: 'web' },
    });

    expect(consoleOnly).not.toBeInstanceOf(ForgeApiClient);
    expect('switchStudio' in consoleOnly).toBe(false);
    expect('appConfig' in consoleOnly).toBe(false);
  });
});
