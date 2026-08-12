import type { ErrorEvent, EventHint } from '@sentry/nestjs';

/**
 * Strips anything sensitive from a Sentry event before it leaves the process.
 *
 * This matters more than the logging redaction it mirrors, because Sentry is a THIRD PARTY.
 * A value that reaches a log line stays on infrastructure we control; a value that reaches
 * Sentry has left the building, sits in a US-hosted service, and is visible to anyone with
 * dashboard access.
 *
 * Two categories, for two different reasons:
 *
 * CREDENTIALS — OTPs, tokens, cookies, the Razorpay signature. Phone OTP is the only
 * authentication factor in Forge, so a code in a Sentry event is a complete account takeover
 * for anyone who can read the issue.
 *
 * PII — phone numbers. Deliberately treated differently from our own logs, which DO keep the
 * phone because it is the account identifier and you need it to trace a login problem. Under
 * the DPDP Act, shipping Indian gym members' phone numbers to a third-party processor is a
 * decision to make explicitly, not a side effect of installing an SDK. Sentry gets the
 * `requestId` instead — our own logs hold the detail, correlated by that id.
 *
 * What is deliberately KEPT: requestId, studioId, role, userId. None is PII, and together
 * they answer the question that actually matters on an incident — is this failing for one
 * studio or all of them.
 */

/** Header names that may travel. Everything else is dropped, so a new header is safe by default. */
const SAFE_HEADERS = new Set([
  'content-type',
  'accept',
  'user-agent',
  'x-request-id',
  'x-client-app',
  'x-client-version',
  'x-client-platform',
]);

/** Keys whose values are replaced wherever they appear, at any depth. */
const SENSITIVE_KEYS = new Set([
  'otp',
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'access_token',
  'refresh_token',
  'secret',
  'authorization',
  'cookie',
  'razorpay_signature',
  'apikey',
  'api_key',
  'phone',
  'mobile',
  'selectiontoken',
]);

const REDACTED = '[redacted]';

/**
 * E.164 Indian mobiles, and bare 10-digit numbers starting 6-9.
 *
 * Applied to free text — exception messages, breadcrumb strings — because a phone number
 * reaches those by being interpolated into an error, which no key-based rule can catch.
 */
const PHONE_PATTERN = /(\+91[6-9]\d{9})|(\b[6-9]\d{9}\b)/g;

/**
 * A 6-digit code, but ONLY when it sits next to a word that means "code".
 *
 * Blanket-scrubbing every 6-digit number was rejected: money is stored in paise, so a
 * legitimate amount is routinely six digits, and "insufficient balance: [redacted]" is a
 * useless error. Requiring the keyword keeps the collateral damage near zero while still
 * catching the realistic case — a code interpolated into a message by a developer debugging.
 */
const OTP_NEAR_KEYWORD = /\b(otp|code|pin|passcode)\b(\W{0,12})\d{4,8}\b/gi;

export function scrubText(value: string): string {
  return value
    .replace(PHONE_PATTERN, '[phone]')
    .replace(OTP_NEAR_KEYWORD, (_match, word: string, gap: string) => `${word}${gap}[redacted]`);
}

/**
 * Recursively redacts by key and scrubs phone numbers from string values.
 *
 * Depth-limited: a deeply nested or circular object would otherwise stall the send path, and
 * an error handler that hangs is worse than a lost event.
 */
export function scrubValue(input: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';

  if (typeof input === 'string') return scrubText(input);
  if (input === null || typeof input !== 'object') return input;

  if (Array.isArray(input)) return input.map((item) => scrubValue(item, depth + 1));

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    output[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : scrubValue(value, depth + 1);
  }
  return output;
}

/**
 * The `beforeSend` hook.
 *
 * Wrapped so a bug in scrubbing cannot silently ship an unscrubbed event: if anything throws,
 * the event is DROPPED rather than sent. Losing an error report is recoverable; leaking a
 * credential to a third party is not.
 */
export function scrubEvent(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  try {
    /**
     * The request is rebuilt from an ALLOWLIST, not filtered by a denylist.
     *
     * The first version spread `...rest` and stripped the query off `url` — and missed that
     * Sentry populates a SEPARATE `query_string` field, so `?phone=+91...` left the process
     * untouched. It also carried `env`, which holds server-side request variables.
     *
     * Rebuilding means any field the SDK adds in a future version is dropped by default
     * rather than forwarded. That is the difference between a scrubber that stays correct and
     * one that silently degrades on upgrade.
     */
    if (event.request) {
      const { method, url, headers, data } = event.request;

      event.request = {
        ...(method ? { method } : {}),
        // Path only. query_string is deliberately not carried forward at all.
        ...(url ? { url: url.split('?')[0] } : {}),
        ...(headers
          ? {
              headers: Object.fromEntries(
                Object.entries(headers).filter(([name]) => SAFE_HEADERS.has(name.toLowerCase())),
              ),
            }
          : {}),
        ...(data === undefined ? {} : { data: scrubValue(data) }),
      };
    }

    if (event.exception?.values) {
      for (const value of event.exception.values) {
        if (value.value) value.value = scrubText(value.value);

        /**
         * Stack frames carry SOURCE LINES. Sentry's contextLines integration reads the file
         * off disk and attaches the surrounding code, so a literal in the source — or a
         * value interpolated on the throwing line — travels with the event.
         *
         * The context is kept rather than removed, because seeing the failing line is most of
         * the value of an error report. It is just scrubbed like any other text.
         */
        for (const frame of value.stacktrace?.frames ?? []) {
          if (frame.context_line) frame.context_line = scrubText(frame.context_line);
          if (frame.pre_context) frame.pre_context = frame.pre_context.map(scrubText);
          if (frame.post_context) frame.post_context = frame.post_context.map(scrubText);
          // Local variable capture, if ever enabled, is a direct dump of request values.
          if (frame.vars) frame.vars = scrubValue(frame.vars) as Record<string, unknown>;
        }
      }
    }

    if (event.message) event.message = scrubText(event.message);

    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map((crumb) => ({
        ...crumb,
        ...(crumb.message ? { message: scrubText(crumb.message) } : {}),
        ...(crumb.data ? { data: scrubValue(crumb.data) as Record<string, unknown> } : {}),
      }));
    }

    if (event.extra) event.extra = scrubValue(event.extra) as Record<string, unknown>;

    // The user object is where an SDK most eagerly puts PII. Only the opaque id survives.
    if (event.user) {
      event.user = event.user.id ? { id: event.user.id } : {};
    }

    return event;
  } catch {
    return null;
  }
}
