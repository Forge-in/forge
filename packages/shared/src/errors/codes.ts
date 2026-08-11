/**
 * The error contract between the API and every client.
 *
 * `code` is the contract; the HTTP status is not. Statuses get re-tuned (a 400 becomes a
 * 422, a 403 becomes a 404 to avoid leaking existence) and clients that branch on status
 * break silently. Clients branch on these strings, which never change meaning.
 *
 * The alternative — matching on `message` — is what makes error handling break when
 * someone improves the wording, and makes it impossible to localise a message without
 * breaking a client.
 */
export const ErrorCode = {
  /** No credentials, or credentials that do not verify. */
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  /** Valid token, past its expiry. Distinct from UNAUTHENTICATED so the client knows to refresh. */
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  /** Authenticated, but not allowed. Never used to reveal that something exists. */
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  /** Request shape failed validation. `details` carries the per-field reasons. */
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  /** Rate limited. `retryable` is true and Retry-After is set. */
  RATE_LIMITED: 'RATE_LIMITED',
  /** The client build is below minSupported. The app must show a blocking upgrade screen. */
  CLIENT_TOO_OLD: 'CLIENT_TOO_OLD',
  /** An Idempotency-Key replay. The original response is returned unchanged. */
  IDEMPOTENT_REPLAY: 'IDEMPOTENT_REPLAY',
  /** Lost a race, or violated a uniqueness rule. Usually safe to retry after a read. */
  CONFLICT: 'CONFLICT',
  /** Well-formed but not permitted by a business rule. */
  UNPROCESSABLE: 'UNPROCESSABLE',
  /** Deliberately opaque. Details go to the log line with the same requestId. */
  INTERNAL: 'INTERNAL',
  /** Dependency unavailable. Distinct from INTERNAL because retrying may work. */
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** One per invalid field. Flat so a client can index it by path without walking a tree. */
export interface ErrorDetail {
  /** Dot path into the request body, e.g. "phone" or "items.0.quantity". */
  path: string;
  /** Machine-readable reason, from the validator. */
  code: string;
  message: string;
}

/**
 * The single response shape for every non-2xx response, from every endpoint.
 *
 * Notably absent: `studioId`. Echoing the tenant back would leak it into client logs and
 * error-reporting services for no benefit.
 */
export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    /**
     * Human-readable, for a developer reading logs. NOT for display: clients render their
     * own copy keyed off `code`, so wording can change freely and can be localised.
     * For 5xx in production this is a fixed generic string.
     */
    message: string;
    details?: ErrorDetail[];
    /**
     * Whether retrying the identical request could succeed. Lets a mobile client decide
     * without hardcoding status knowledge in four separate apps.
     */
    retryable: boolean;
    /** Correlates with the server log line. Show it in the UI — support becomes trivial. */
    requestId: string;
    timestamp: string;
  };
}

/** True when the same request might succeed later without the caller changing anything. */
export function isRetryable(code: ErrorCode): boolean {
  return (
    code === ErrorCode.RATE_LIMITED ||
    code === ErrorCode.SERVICE_UNAVAILABLE ||
    code === ErrorCode.INTERNAL
  );
}

/** Narrowing helper for clients, so a caught error can be inspected without casts. */
export function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = (value as { error?: unknown }).error;
  if (typeof candidate !== 'object' || candidate === null) return false;
  const { code, requestId } = candidate as { code?: unknown; requestId?: unknown };
  return typeof code === 'string' && typeof requestId === 'string';
}
