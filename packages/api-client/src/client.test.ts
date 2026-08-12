import { ErrorCode, type ErrorEnvelope } from '@forge/shared';
import { describe, expect, it, vi } from 'vitest';

import { ForgeApiClient } from './client.js';
import { ForgeApiError, ForgeNetworkError } from './errors.js';
import { memoryTokenStore } from './token-store.js';

/**
 * The client is where the mobile-network failure modes are absorbed. Each test below is a
 * specific one, not a happy-path smoke check.
 */

const envelope = (code: ErrorCode, message = 'nope', retryable = false): ErrorEnvelope => ({
  error: { code, message, retryable, requestId: 'req-1', timestamp: new Date().toISOString() },
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': 'req-1' },
  });
}

function makeClient(
  fetchImpl: typeof fetch,
  overrides?: Partial<Parameters<typeof ForgeApiClient.prototype.constructor>[0]>,
) {
  const tokenStore = memoryTokenStore({ accessToken: 'access-1', refreshToken: 'refresh-1' });

  const client = new ForgeApiClient({
    baseUrl: 'https://api.test',
    tokenStore,
    client: { app: 'user-mobile', version: '1.0.0', platform: 'ios' },
    fetchImpl,
    ...overrides,
  });

  return { client, tokenStore };
}

describe('request headers', () => {
  it('identifies the client so the forced-upgrade guard can act', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    const { client } = makeClient(fetchImpl as unknown as typeof fetch);

    await client.me();

    const headers = (fetchImpl.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers['x-client-app']).toBe('user-mobile');
    expect(headers['x-client-version']).toBe('1.0.0');
    expect(headers['x-client-platform']).toBe('ios');
  });

  it('attaches the bearer token on authenticated calls', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    const { client } = makeClient(fetchImpl as unknown as typeof fetch);

    await client.me();

    const headers = (fetchImpl.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer access-1');
  });

  it('sends no bearer on sign-in, which has no session yet', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ status: 'sent', retryAfterSeconds: 60, expiresInSeconds: 300 }),
    );
    const { client } = makeClient(fetchImpl as unknown as typeof fetch);

    await client.requestOtp({ phone: '+919876543210' });

    const headers = (fetchImpl.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
  });

  /**
   * Gym floors have poor signal, so mutating requests get retried by the platform, by a
   * proxy, or by a user tapping twice. Without a key the server cannot tell a retry from a
   * second intent — a duplicate check-in, or a double charge.
   */
  it('puts an idempotency key on every mutating request', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ status: 'signed_out' }));
    const { client } = makeClient(fetchImpl as unknown as typeof fetch);

    await client.logout();

    const headers = (fetchImpl.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers['idempotency-key']).toBeTruthy();
  });

  it('does not put one on a GET, which is already safe to repeat', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    const { client } = makeClient(fetchImpl as unknown as typeof fetch);

    await client.me();

    const headers = (fetchImpl.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers['idempotency-key']).toBeUndefined();
  });

  it('honours a caller-supplied key, so a queued action keeps its identity across retries', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    const { client } = makeClient(fetchImpl as unknown as typeof fetch);

    await client.request({
      method: 'POST',
      path: '/v1/attendance',
      body: {},
      idempotencyKey: 'checkin-abc',
    });

    const headers = (fetchImpl.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers['idempotency-key']).toBe('checkin-abc');
  });
});

describe('the refresh storm', () => {
  /**
   * THE test for this file.
   *
   * An app resuming from background fires every mounted screen at once; all get 401. Without
   * a single-flight mutex that is N concurrent refresh calls for one session — N pointless
   * round trips on a poor connection, and if the server's grace window ever lapses
   * mid-storm, reuse detection revokes the family and signs the user out for doing nothing
   * wrong.
   */
  it('makes ONE refresh call for many simultaneous 401s', async () => {
    let refreshCalls = 0;
    let refreshed = false;

    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const path = String(url);

      if (path.endsWith('/v1/auth/refresh')) {
        refreshCalls += 1;
        // A real refresh is not instant; the delay is what creates the overlap.
        await new Promise((resolve) => setTimeout(resolve, 20));
        refreshed = true;
        return jsonResponse({
          tokens: { accessToken: 'access-2', refreshToken: 'refresh-2', expiresInSeconds: 900 },
        });
      }

      const auth = (init?.headers as Record<string, string> | undefined)?.authorization;
      if (!refreshed || auth === 'Bearer access-1') {
        return jsonResponse(envelope(ErrorCode.TOKEN_EXPIRED, 'expired'), 401);
      }

      return jsonResponse({ ok: true });
    });

    const { client, tokenStore } = makeClient(fetchImpl as unknown as typeof fetch);

    const results = await Promise.all([
      client.me(),
      client.me(),
      client.me(),
      client.me(),
      client.me(),
    ]);

    expect(results).toHaveLength(5);
    expect(refreshCalls).toBe(1);
    // And the new token was stored, so subsequent calls start authenticated.
    expect(await tokenStore.getAccessToken()).toBe('access-2');
  });

  /**
   * A refresh that never reached the server must NOT end the session.
   *
   * Losing signal at the exact moment an access token expires is routine on the networks
   * this product runs on. Clearing tokens there would make the user re-enter an OTP over a
   * momentary blip — so the tokens survive and the app surfaces a network error instead.
   */
  it('keeps the session when the refresh could not be attempted', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/v1/auth/refresh')) throw new TypeError('offline');
      return jsonResponse(envelope(ErrorCode.TOKEN_EXPIRED), 401);
    });

    const onSessionExpired = vi.fn();
    const { client, tokenStore } = makeClient(fetchImpl as unknown as typeof fetch, {
      onSessionExpired,
    });

    await expect(client.me()).rejects.toBeInstanceOf(ForgeApiError);

    expect(await tokenStore.getRefreshToken()).toBe('refresh-1');
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  /** A refresh the server REFUSED does end it — that token will never work again. */
  it('ends the session when the refresh is definitively rejected', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/v1/auth/refresh')) {
        return jsonResponse(envelope(ErrorCode.UNAUTHENTICATED), 401);
      }
      return jsonResponse(envelope(ErrorCode.TOKEN_EXPIRED), 401);
    });

    const onSessionExpired = vi.fn();
    const { client, tokenStore } = makeClient(fetchImpl as unknown as typeof fetch, {
      onSessionExpired,
    });

    await expect(client.me()).rejects.toBeInstanceOf(ForgeApiError);

    expect(await tokenStore.getRefreshToken()).toBeUndefined();
    expect(onSessionExpired).toHaveBeenCalled();
  });

  /**
   * Only an EXPIRED token is worth refreshing. Treating every 401 as refreshable turns a
   * revoked session into a retry loop against an endpoint that will never succeed.
   */
  it('does not refresh on a revoked session', async () => {
    let refreshCalls = 0;

    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/v1/auth/refresh')) {
        refreshCalls += 1;
        return jsonResponse({}, 500);
      }
      return jsonResponse(envelope(ErrorCode.UNAUTHENTICATED, 'revoked'), 401);
    });

    const { client } = makeClient(fetchImpl as unknown as typeof fetch);

    await expect(client.me()).rejects.toMatchObject({ code: ErrorCode.UNAUTHENTICATED });
    expect(refreshCalls).toBe(0);
  });

  it('retries the original request exactly once, never in a loop', async () => {
    let meCalls = 0;

    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/v1/auth/refresh')) {
        return jsonResponse({
          tokens: { accessToken: 'access-2', refreshToken: 'refresh-2', expiresInSeconds: 900 },
        });
      }
      meCalls += 1;
      // Still 401 even after refreshing — the session is genuinely gone.
      return jsonResponse(envelope(ErrorCode.TOKEN_EXPIRED), 401);
    });

    const { client } = makeClient(fetchImpl as unknown as typeof fetch);

    await expect(client.me()).rejects.toBeInstanceOf(ForgeApiError);
    // Original plus one retry. Not three, not infinite.
    expect(meCalls).toBe(2);
  });
});

describe('error handling', () => {
  it('surfaces the envelope code, not the status', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(envelope(ErrorCode.FORBIDDEN, 'no access'), 403),
    );
    const { client } = makeClient(fetchImpl as unknown as typeof fetch);

    await expect(client.me()).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN,
      status: 403,
      requestId: 'req-1',
    });
  });

  it('exposes field errors for form highlighting', async () => {
    const body: ErrorEnvelope = {
      error: {
        code: ErrorCode.VALIDATION_FAILED,
        message: 'invalid',
        details: [{ path: 'phone', code: 'invalid_string', message: 'Must be +91' }],
        retryable: false,
        requestId: 'req-1',
        timestamp: new Date().toISOString(),
      },
    };

    const fetchImpl = vi.fn(async () => jsonResponse(body, 400));
    const { client } = makeClient(fetchImpl as unknown as typeof fetch);

    try {
      await client.requestOtp({ phone: 'bad' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ForgeApiError);
      expect((error as ForgeApiError).fieldErrors()).toEqual({ phone: 'Must be +91' });
    }
  });

  /**
   * A gateway timeout returns HTML, a captive portal returns a login page. Inspecting those
   * must never throw, or the error handler becomes the crash.
   */
  it('handles a non-envelope body without throwing', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('<html>504 Gateway Timeout</html>', { status: 504 }),
    );
    const { client } = makeClient(fetchImpl as unknown as typeof fetch);

    await expect(client.me()).rejects.toMatchObject({
      code: ErrorCode.SERVICE_UNAVAILABLE,
      retryable: true,
    });
  });

  it('distinguishes a network failure from a server error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Network request failed');
    });
    const { client } = makeClient(fetchImpl as unknown as typeof fetch);

    await expect(client.me()).rejects.toBeInstanceOf(ForgeNetworkError);
  });

  /** RN's fetch has no default timeout: without this a dead connection hangs forever. */
  it('times out rather than hanging', async () => {
    const fetchImpl = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    const { client } = makeClient(fetchImpl as unknown as typeof fetch, { timeoutMs: 30 });

    await expect(client.me()).rejects.toThrow(/timed out/);
  });

  it('notifies the app once when the session is unrecoverable', async () => {
    const onSessionExpired = vi.fn();
    const fetchImpl = vi.fn(async () => jsonResponse(envelope(ErrorCode.UNAUTHENTICATED), 401));

    const { client } = makeClient(fetchImpl as unknown as typeof fetch, { onSessionExpired });

    await expect(client.me()).rejects.toBeInstanceOf(ForgeApiError);
    expect(onSessionExpired).toHaveBeenCalled();
  });

  /** 426 is the forced-upgrade signal; the app must show a blocking screen, not a toast. */
  it('notifies the app when the build is too old', async () => {
    const onUpgradeRequired = vi.fn();
    const fetchImpl = vi.fn(async () =>
      jsonResponse(envelope(ErrorCode.CLIENT_TOO_OLD, 'Please update'), 426),
    );

    const { client } = makeClient(fetchImpl as unknown as typeof fetch, { onUpgradeRequired });

    await expect(client.me()).rejects.toMatchObject({ requiresUpgrade: true });
    expect(onUpgradeRequired).toHaveBeenCalledWith('Please update');
  });
});

describe('session lifecycle', () => {
  it('stores tokens after a successful sign-in', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        status: 'authenticated',
        tokens: { accessToken: 'a', refreshToken: 'r', expiresInSeconds: 900 },
        membership: {
          membershipId: '1',
          studioId: '2',
          studioName: 'Iron House',
          role: 'gym_user',
        },
        user: { id: '3', phone: '+919876543210', fullName: null },
      }),
    );

    const { client, tokenStore } = makeClient(fetchImpl as unknown as typeof fetch);
    await client.verifyOtp({ phone: '+919876543210', otp: '123456' });

    expect(await tokenStore.getAccessToken()).toBe('a');
  });

  it('does NOT store tokens when a studio still has to be chosen', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ status: 'needsStudioSelection', selectionToken: 't', memberships: [] }),
    );

    const { client, tokenStore } = makeClient(fetchImpl as unknown as typeof fetch);
    await client.verifyOtp({ phone: '+919876543210', otp: '123456' });

    // Storing a half-session here would leave the app authenticated with no studio.
    expect(await tokenStore.getAccessToken()).toBe('access-1');
  });

  it('clears tokens locally even when logout fails on the server', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('offline');
    });

    const { client, tokenStore } = makeClient(fetchImpl as unknown as typeof fetch);

    // A user who taps "sign out" must end up signed out regardless of connectivity.
    await expect(client.logout()).rejects.toBeInstanceOf(ForgeNetworkError);
    expect(await tokenStore.getAccessToken()).toBeUndefined();
  });
});

describe('studio switching', () => {
  it('stores the reissued pair, so later calls use the new studio', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        tokens: { accessToken: 'access-studio2', refreshToken: 'r2', expiresInSeconds: 900 },
        membership: {
          membershipId: 'm2',
          studioId: 's2',
          studioName: 'Second Studio',
          role: 'trainer',
        },
      }),
    );

    const { client, tokenStore } = makeClient(fetchImpl as unknown as typeof fetch);
    const result = await client.switchStudio({ membershipId: 'm2' });

    expect(result.membership.studioId).toBe('s2');
    // Not storing here would leave the app showing the new studio while still sending the
    // old studio's token — every subsequent read would be scoped to the wrong tenant.
    expect(await tokenStore.getAccessToken()).toBe('access-studio2');
  });
});

describe('app config', () => {
  /** Unauthenticated by design: an app that is too old to sign in still has to be told to update. */
  it('is fetched without a bearer token', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        minSupported: '1.2.0',
        latest: '1.5.0',
        message: 'Please update',
        maintenance: false,
        flags: {},
      }),
    );

    const { client } = makeClient(fetchImpl as unknown as typeof fetch);
    const config = await client.appConfig();

    expect(config.minSupported).toBe('1.2.0');
    const headers = (fetchImpl.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
  });
});

describe('idempotency key generation', () => {
  /**
   * Hermes on older Android configurations has no global crypto. A key generator that threw
   * there would fail EVERY mutating request on those devices — so the fallback is load
   * bearing, not defensive clutter. The value is only ever a de-duplication token.
   */
  it('still produces a key when crypto.randomUUID is unavailable', async () => {
    const original = globalThis.crypto;
    // @ts-expect-error deliberately simulating a runtime without crypto
    delete (globalThis as { crypto?: unknown }).crypto;

    try {
      const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
      const { client } = makeClient(fetchImpl as unknown as typeof fetch);

      await client.request({ method: 'POST', path: '/v1/thing', body: {} });

      const headers = (fetchImpl.mock.calls[0]?.[1] as RequestInit).headers as Record<
        string,
        string
      >;
      expect(headers['idempotency-key']).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
    }
  });
});

describe('ForgeApiError helpers', () => {
  it('flags an expired session so the app can route to sign-in', () => {
    const error = new ForgeApiError({
      code: ErrorCode.UNAUTHENTICATED,
      status: 401,
      message: 'gone',
      retryable: false,
      requestId: 'r',
    });

    expect(error.requiresSignIn).toBe(true);
    expect(error.requiresUpgrade).toBe(false);
  });

  it('flags an outdated build so the app shows a blocking screen', () => {
    const error = new ForgeApiError({
      code: ErrorCode.CLIENT_TOO_OLD,
      status: 426,
      message: 'update',
      retryable: false,
      requestId: 'r',
    });

    expect(error.requiresUpgrade).toBe(true);
    expect(error.requiresSignIn).toBe(false);
  });

  it('returns an empty field map when there are no details', () => {
    const error = new ForgeApiError({
      code: ErrorCode.INTERNAL,
      status: 500,
      message: 'boom',
      retryable: true,
      requestId: 'r',
    });

    expect(error.fieldErrors()).toEqual({});
  });
});

describe('request id resolution', () => {
  /**
   * The envelope carries the id, but a proxy that rewrites the body — or an early failure
   * before the filter populated it — can leave it empty. Falling back to the header keeps
   * support traceability, which is the only reason the id is surfaced to users at all.
   */
  it('falls back to the response header when the envelope id is empty', async () => {
    const body: ErrorEnvelope = {
      error: {
        code: ErrorCode.INTERNAL,
        message: 'boom',
        retryable: true,
        requestId: '',
        timestamp: new Date().toISOString(),
      },
    };

    const fetchImpl = vi.fn(async () => jsonResponse(body, 500));
    const { client } = makeClient(fetchImpl as unknown as typeof fetch);

    await expect(client.me()).rejects.toMatchObject({ requestId: 'req-1' });
  });

  it('reports "unknown" rather than throwing when there is no id anywhere', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 500 }));
    const { client } = makeClient(fetchImpl as unknown as typeof fetch);

    await expect(client.me()).rejects.toMatchObject({ requestId: 'unknown' });
  });
});
