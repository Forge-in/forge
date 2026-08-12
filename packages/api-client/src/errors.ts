import { ErrorCode, isErrorEnvelope, type ErrorDetail } from '@forge/shared';

/**
 * A failed API call, in a shape clients can branch on.
 *
 * Clients switch on `code`, never on `status` or `message`. Statuses get re-tuned (a 400
 * becomes a 422, a 403 becomes a 404 to avoid leaking existence) and message wording changes
 * or gets localised — both would silently break a client that matched on them.
 */
export class ForgeApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: ErrorDetail[];
  readonly retryable: boolean;
  /** Quote this in a bug report; it matches a single server log line. */
  readonly requestId: string;

  constructor(init: {
    code: ErrorCode;
    status: number;
    message: string;
    details?: ErrorDetail[];
    retryable: boolean;
    requestId: string;
  }) {
    super(init.message);
    this.name = 'ForgeApiError';
    this.code = init.code;
    this.status = init.status;
    this.details = init.details ?? [];
    this.retryable = init.retryable;
    this.requestId = init.requestId;
  }

  /** Field errors keyed by path, for highlighting the offending input. */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.details.map((detail) => [detail.path, detail.message]));
  }

  /** True when the app should show a blocking "update required" screen. */
  get requiresUpgrade(): boolean {
    return this.code === ErrorCode.CLIENT_TOO_OLD;
  }

  /** True when the session is gone and the user must sign in again. */
  get requiresSignIn(): boolean {
    return this.code === ErrorCode.UNAUTHENTICATED;
  }
}

/**
 * Builds a ForgeApiError from a response.
 *
 * The body is not always our envelope. A gateway timeout returns HTML, a CDN returns its own
 * JSON, a captive portal returns a login page — so this must never throw while inspecting a
 * response, or the error handler becomes the crash.
 */
export async function toForgeApiError(response: Response): Promise<ForgeApiError> {
  const requestIdHeader = response.headers.get('x-request-id') ?? 'unknown';

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }

  if (isErrorEnvelope(body)) {
    const { error } = body;
    return new ForgeApiError({
      code: error.code,
      status: response.status,
      message: error.message,
      // Conditional spread for the same exactOptionalPropertyTypes reason as above.
      ...(error.details ? { details: error.details } : {}),
      retryable: error.retryable,
      requestId: error.requestId || requestIdHeader,
    });
  }

  // Not our envelope: something between the client and the API answered. Mapped to a
  // plausible code so callers still have one thing to branch on.
  return new ForgeApiError({
    code: response.status >= 500 ? ErrorCode.SERVICE_UNAVAILABLE : ErrorCode.INTERNAL,
    status: response.status,
    message: `Request failed with status ${response.status}`,
    retryable: response.status >= 500,
    requestId: requestIdHeader,
  });
}

/**
 * A request that never reached the API — no signal, DNS failure, aborted timeout.
 *
 * Kept distinct from a server error because the remedy differs: the user should be told
 * their connection failed, and the request is safe to retry unchanged.
 */
export class ForgeNetworkError extends Error {
  readonly retryable = true;

  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ForgeNetworkError';
  }
}
