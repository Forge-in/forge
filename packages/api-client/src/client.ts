import { ErrorCode, v1 } from '@forge/shared';

import { ForgeApiError, ForgeNetworkError, toForgeApiError } from './errors.js';
import { type TokenStore } from './token-store.js';

export interface ClientOptions {
  /** Base URL with no trailing slash, e.g. https://api.forge.in or /api (BFF path). */
  baseUrl: string;
  tokenStore: TokenStore;

  /**
   * Identifies the calling app to the API. Sent on every request as x-client-* headers, and
   * read by the forced-upgrade guard — an app that omits them cannot be told it is too old.
   */
  client: {
    app: 'admin' | 'owner-web' | 'owner-mobile' | 'trainer-mobile' | 'user-mobile';
    version: string;
    platform: 'web' | 'ios' | 'android';
    build?: string;
  };

  /**
   * React Native's fetch has NO default timeout, so a request on a dead connection hangs
   * forever and the user is left staring at a spinner with no way to retry.
   */
  timeoutMs?: number;

  /** Called when the session is unrecoverable, so the app can route to sign-in once. */
  onSessionExpired?: () => void;

  /** Called on 426, so the app can show a blocking upgrade screen. */
  onUpgradeRequired?: (message: string) => void;

  fetchImpl?: typeof fetch;
}

interface RequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  /** Skips the auth header and the refresh dance. For sign-in and refresh themselves. */
  anonymous?: boolean;
  /**
   * Overrides the generated idempotency key. Pass a stable value for a retryable action the
   * user might trigger twice — a check-in queued offline, a payment.
   */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Why three states rather than a boolean.
 *
 * 'rejected' means the server answered and refused — the session is over. 'unavailable'
 * means the request never arrived, so the session may be entirely valid and clearing the
 * tokens would sign the user out over a momentary loss of signal.
 */
type RefreshOutcome = 'refreshed' | 'rejected' | 'unavailable';

export class ForgeApiClient {
  private readonly fetchImpl: typeof fetch;

  /**
   * THE SINGLE-FLIGHT REFRESH MUTEX.
   *
   * When an app resumes from background, every mounted screen fires at once, all get 401,
   * and all try to refresh. Without this, that is N concurrent refresh calls for one
   * session. The server has a grace window that returns the same successor to racers, but
   * relying on it alone means N pointless round trips on a connection that is usually poor
   * — and if the window ever lapses mid-storm, reuse detection revokes the family and the
   * user is signed out for doing nothing wrong.
   *
   * Both halves are required. This is the client half.
   */
  private refreshInFlight: Promise<RefreshOutcome> | undefined;

  constructor(private readonly options: ClientOptions) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  // ---- auth ---------------------------------------------------------------------------

  async requestOtp(body: v1.RequestOtpBody): Promise<v1.RequestOtpResponse> {
    return this.request({ method: 'POST', path: '/v1/auth/request-otp', body, anonymous: true });
  }

  async verifyOtp(body: v1.VerifyOtpBody): Promise<v1.VerifyOtpResponse> {
    const result = await this.request<v1.VerifyOtpResponse>({
      method: 'POST',
      path: '/v1/auth/verify-otp',
      body,
      anonymous: true,
    });

    if (result.status === 'authenticated') {
      await this.options.tokenStore.setTokens(result.tokens);
    }

    return result;
  }

  async me(): Promise<v1.MeResponse> {
    return this.request({ method: 'GET', path: '/v1/auth/me' });
  }

  async switchStudio(body: v1.SwitchStudioBody): Promise<v1.SwitchStudioResponse> {
    const result = await this.request<v1.SwitchStudioResponse>({
      method: 'POST',
      path: '/v1/auth/switch-studio',
      body,
    });

    await this.options.tokenStore.setTokens(result.tokens);
    return result;
  }

  async logout(): Promise<void> {
    const refreshToken = await this.options.tokenStore.getRefreshToken();

    try {
      await this.request({
        method: 'POST',
        path: '/v1/auth/logout',
        body: refreshToken ? { refreshToken } : {},
      });
    } finally {
      // Cleared even if the call failed. A user who taps "sign out" must end up signed out
      // locally regardless of whether the server was reachable.
      await this.options.tokenStore.clear();
    }
  }

  async appConfig(): Promise<v1.AppConfigResponse> {
    return this.request({ method: 'GET', path: '/v1/app-config', anonymous: true });
  }

  // ---- transport ----------------------------------------------------------------------

  /**
   * One request, with one automatic retry after a successful refresh.
   *
   * Exactly one retry, never a loop: if the refreshed token is also rejected then the
   * session is genuinely gone, and retrying would spin against a 401 forever.
   */
  async request<T>(options: RequestOptions): Promise<T> {
    const response = await this.send(options);

    if (response.status === 401 && !options.anonymous) {
      const error = await toForgeApiError(response.clone());

      // Only an EXPIRED token is worth refreshing. A revoked or malformed one will fail
      // again, and treating every 401 as refreshable turns a dead session into a retry loop.
      if (error.code === ErrorCode.TOKEN_EXPIRED) {
        const outcome = await this.refreshOnce();

        if (outcome === 'refreshed') return this.handle<T>(await this.send(options));

        /**
         * Only a DEFINITIVE rejection ends the session.
         *
         * The earlier version cleared tokens whenever a refresh did not succeed, including
         * when it simply could not be attempted — so losing signal at the moment an access
         * token expired signed the user out and made them re-enter an OTP. On the networks
         * this product runs on that is a routine event, not an edge case.
         *
         * 'unavailable' therefore leaves the session intact and surfaces the network error,
         * so the app can retry when connectivity returns.
         */
        if (outcome === 'rejected') {
          await this.options.tokenStore.clear();
          this.options.onSessionExpired?.();
        }
      }

      // A 401 that is not refreshable means the session is over, whatever the reason. The
      // app has to be told, or it sits on a screen whose every request fails.
      if (error.code === ErrorCode.UNAUTHENTICATED) {
        this.options.onSessionExpired?.();
      }

      throw error;
    }

    return this.handle<T>(response);
  }

  private async handle<T>(response: Response): Promise<T> {
    if (response.ok) {
      // 204 has no body; parsing it would throw on a perfectly successful call.
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    }

    const error = await toForgeApiError(response);

    if (error.code === ErrorCode.CLIENT_TOO_OLD) {
      this.options.onUpgradeRequired?.(error.message);
    }
    if (error.code === ErrorCode.UNAUTHENTICATED) {
      this.options.onSessionExpired?.();
    }

    throw error;
  }

  private async send(options: RequestOptions): Promise<Response> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'x-client-app': this.options.client.app,
      'x-client-version': this.options.client.version,
      'x-client-platform': this.options.client.platform,
      ...(this.options.client.build ? { 'x-client-build': this.options.client.build } : {}),
    };

    if (options.body !== undefined) headers['content-type'] = 'application/json';

    /**
     * An idempotency key on every mutating request, by default.
     *
     * Gym floors have poor signal and requests get retried — by the platform, by a proxy, by
     * a user tapping twice. Without a key the server cannot tell a retry from a second
     * intent, which for a check-in is a duplicate row and for a payment is a double charge.
     * Generated here so no caller has to remember.
     */
    if (MUTATING.has(options.method)) {
      headers['idempotency-key'] = options.idempotencyKey ?? randomKey();
    }

    if (!options.anonymous) {
      const accessToken = await this.options.tokenStore.getAccessToken();
      if (accessToken) headers.authorization = `Bearer ${accessToken}`;
    }

    const timeoutMs = this.options.timeoutMs ?? 15_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // Honour a caller's own abort (a component unmounting) alongside the timeout.
    options.signal?.addEventListener('abort', () => controller.abort(), { once: true });

    try {
      return await this.fetchImpl(`${this.options.baseUrl}${options.path}`, {
        method: options.method,
        headers,
        // Spread rather than `body: undefined`: under exactOptionalPropertyTypes an
        // explicit undefined is not the same as an absent key, and RequestInit forbids it.
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        // Sends the httpOnly session cookie on the BFF path; harmless on the bearer path.
        credentials: 'include',
        signal: controller.signal,
      });
    } catch (cause) {
      throw new ForgeNetworkError(
        controller.signal.aborted
          ? `Request timed out after ${timeoutMs}ms`
          : 'Could not reach the server',
        cause,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Refreshes at most once concurrently.
   *
   * Every caller awaits the same promise, so N screens produce ONE refresh call. The promise
   * is cleared in `finally` so a later 401 can refresh again — leaving it set would cache a
   * failure forever and permanently break the session.
   */
  private async refreshOnce(): Promise<RefreshOutcome> {
    this.refreshInFlight ??= this.doRefresh().finally(() => {
      this.refreshInFlight = undefined;
    });

    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<RefreshOutcome> {
    const refreshToken = await this.options.tokenStore.getRefreshToken();

    /**
     * No refresh token is 'rejected', not 'unavailable': on the bearer path it means there
     * is no session to renew, so the user must sign in. The BFF path never reaches here —
     * the browser holds no tokens and the route handler refreshes server-side.
     */
    if (!refreshToken) return 'rejected';

    try {
      const response = await this.send({
        method: 'POST',
        path: '/v1/auth/refresh',
        body: { refreshToken },
        anonymous: true,
      });

      // The server answered and said no: the refresh token is expired, revoked, or its
      // family was killed by reuse detection. The session is genuinely over.
      if (!response.ok) return 'rejected';

      const { tokens } = (await response.json()) as v1.RefreshResponse;
      await this.options.tokenStore.setTokens(tokens);
      return 'refreshed';
    } catch {
      // Never reached the server. The session may be perfectly valid — we simply do not
      // know — so the tokens are kept and the app can retry.
      return 'unavailable';
    }
  }
}

/**
 * crypto.randomUUID where available, with a fallback.
 *
 * React Native's Hermes has no global crypto on older configurations, and an idempotency key
 * that throws would fail every mutating request — so the fallback is deliberate rather than
 * lazy. It is only ever a de-duplication token, never a secret.
 */
function randomKey(): string {
  const cryptoRef = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export { ForgeApiError, ForgeNetworkError };
