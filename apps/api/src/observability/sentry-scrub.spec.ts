import type { ErrorEvent } from '@sentry/nestjs';

import { scrubEvent, scrubText, scrubValue } from './sentry-scrub';

/**
 * Scrubbing is tested harder than the wiring, because Sentry is a THIRD PARTY. A value that
 * reaches a log line stays on infrastructure we control; a value that reaches Sentry has left
 * the building and is visible to anyone with dashboard access.
 */

const OTP = '424242';
const PHONE = '+919876543210';
const TOKEN = 'eyJhbGciOi.secrettokenvalue';

const event = (overrides: Partial<ErrorEvent>): ErrorEvent => ({ ...overrides }) as ErrorEvent;

describe('scrubText', () => {
  it('removes an E.164 Indian mobile from free text', () => {
    expect(scrubText(`Failed to send OTP to ${PHONE}`)).toBe('Failed to send OTP to [phone]');
  });

  it('removes a bare 10-digit mobile', () => {
    expect(scrubText('lookup failed for 9876543210')).toBe('lookup failed for [phone]');
  });

  it('leaves numbers that are not mobiles alone', () => {
    // A studio id fragment, a port, a count — scrubbing these would make errors unreadable.
    expect(scrubText('studio 12345 on port 4000 had 5 failures')).toBe(
      'studio 12345 on port 4000 had 5 failures',
    );
  });

  it('removes every occurrence, not just the first', () => {
    const result = scrubText(`${PHONE} and 9812345678 both failed`);
    expect(result).not.toContain('9876543210');
    expect(result).not.toContain('9812345678');
  });
});

describe('scrubValue', () => {
  it.each([
    'otp',
    'password',
    'token',
    'refreshToken',
    'accessToken',
    'secret',
    'authorization',
    'cookie',
    'razorpay_signature',
    'phone',
    'selectionToken',
  ])('redacts a %s field', (key) => {
    const result = scrubValue({ [key]: 'sensitive-value' }) as Record<string, string>;
    expect(result[key]).toBe('[redacted]');
  });

  it('matches keys case-insensitively, as a client may send any casing', () => {
    const result = scrubValue({ OTP: OTP, Authorization: TOKEN }) as Record<string, string>;
    expect(result.OTP).toBe('[redacted]');
    expect(result.Authorization).toBe('[redacted]');
  });

  it('redacts at depth, which is how a body actually arrives', () => {
    const result = scrubValue({ req: { body: { user: { otp: OTP, name: 'Rahul' } } } });
    expect(JSON.stringify(result)).not.toContain(OTP);
    // Non-sensitive siblings survive, or the report is useless.
    expect(JSON.stringify(result)).toContain('Rahul');
  });

  it('scrubs phone numbers inside array values', () => {
    const result = scrubValue({ recipients: [PHONE, '9812345678'] });
    expect(JSON.stringify(result)).not.toContain('9876543210');
  });

  it('keeps identifiers that are needed to diagnose anything', () => {
    const result = scrubValue({
      studioId: 'studio-1',
      requestId: 'req-1',
      role: 'gym_owner',
      statusCode: 500,
    }) as Record<string, unknown>;

    expect(result.studioId).toBe('studio-1');
    expect(result.requestId).toBe('req-1');
    expect(result.role).toBe('gym_owner');
    expect(result.statusCode).toBe(500);
  });

  /** A circular or very deep object must not stall the send path. */
  it('truncates rather than recursing forever', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => scrubValue(circular)).not.toThrow();
    expect(JSON.stringify(scrubValue(circular))).toContain('[truncated]');
  });
});

describe('scrubEvent', () => {
  it('drops every header except a small safe allowlist', () => {
    const result = scrubEvent(
      event({
        request: {
          url: 'https://api.forge.in/api/v1/auth/verify-otp',
          headers: {
            authorization: `Bearer ${TOKEN}`,
            cookie: 'forge_at=abc123',
            'x-razorpay-signature': 'deadbeef',
            'content-type': 'application/json',
            'x-request-id': 'req-1',
          },
        },
      }),
      {},
    );

    const headers = result?.request?.headers ?? {};
    // Allowlist, not denylist: a header added next year is safe before anyone updates a list.
    expect(Object.keys(headers).sort()).toEqual(['content-type', 'x-request-id']);
    expect(JSON.stringify(result)).not.toContain('secrettokenvalue');
    expect(JSON.stringify(result)).not.toContain('abc123');
  });

  it('strips the query string, which carries search terms', () => {
    const result = scrubEvent(
      event({
        request: { url: 'https://api.forge.in/api/v1/members?q=rahul&phone=%2B919876543210' },
      }),
      {},
    );

    expect(result?.request?.url).toBe('https://api.forge.in/api/v1/members');
    expect(JSON.stringify(result)).not.toContain('rahul');
  });

  it('redacts the request body', () => {
    const result = scrubEvent(
      event({ request: { url: '/x', data: { phone: PHONE, otp: OTP } } }),
      {},
    );

    expect(JSON.stringify(result)).not.toContain(OTP);
    expect(JSON.stringify(result)).not.toContain('9876543210');
  });

  it('scrubs a phone number interpolated into an exception message', () => {
    const result = scrubEvent(
      event({
        exception: {
          values: [{ type: 'Error', value: `No membership found for ${PHONE}` }],
        },
      }),
      {},
    );

    expect(result?.exception?.values?.[0]?.value).toBe('No membership found for [phone]');
  });

  it('scrubs breadcrumbs, which capture the requests leading up to the error', () => {
    const result = scrubEvent(
      event({
        breadcrumbs: [{ message: `POST /verify-otp for ${PHONE}`, data: { otp: OTP } }],
      }),
      {},
    );

    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain('9876543210');
    expect(serialised).not.toContain(OTP);
  });

  /**
   * The user object is where an SDK most eagerly attaches PII. Only the opaque id survives —
   * enough to group issues by user, not enough to identify anyone.
   */
  it('reduces the user object to an opaque id', () => {
    const result = scrubEvent(
      event({
        user: { id: 'usr-1', email: 'a@b.com', username: PHONE, ip_address: '1.2.3.4' },
      }),
      {},
    );

    expect(result?.user).toEqual({ id: 'usr-1' });
  });

  /**
   * Fails CLOSED. A bug in scrubbing must not result in an unscrubbed event being sent —
   * losing an error report is recoverable, leaking a credential to a third party is not.
   */
  it('drops the event entirely if scrubbing throws', () => {
    const hostile = event({});
    Object.defineProperty(hostile, 'request', {
      get() {
        throw new Error('boom');
      },
    });

    expect(scrubEvent(hostile, {})).toBeNull();
  });

  it('passes through an event with nothing sensitive in it', () => {
    const result = scrubEvent(event({ message: 'database pool exhausted' }), {});
    expect(result?.message).toBe('database pool exhausted');
  });
});

/**
 * Regression tests for leaks found by sending a REAL event through the real SDK to a fake
 * ingest endpoint. Every case below actually escaped before being fixed — none was predicted
 * by reading the code.
 */
describe('scrubEvent — leaks found in a live envelope', () => {
  /**
   * THE production bug. The first version stripped the query off `request.url` and never
   * touched `query_string`, which Sentry populates SEPARATELY — so `?phone=+91...` left the
   * process on every request carrying a phone in the query.
   */
  it('does not forward query_string', () => {
    const result = scrubEvent(
      event({
        request: {
          method: 'GET',
          url: 'http://localhost:4000/api/v1/boom',
          query_string: 'phone=%2B919876543210',
        },
      }),
      {},
    );

    expect(JSON.stringify(result)).not.toContain('919876543210');
    expect(result?.request?.query_string).toBeUndefined();
  });

  /**
   * The request is rebuilt from an allowlist, so a field a future SDK version adds is dropped
   * rather than forwarded. `env` holds server-side request variables.
   */
  it('drops request fields it does not explicitly allow', () => {
    const result = scrubEvent(
      event({
        request: {
          method: 'POST',
          url: '/x',
          env: { REMOTE_ADDR: '203.0.113.9', SERVER_NAME: 'internal-host' },
        },
      }),
      {},
    );

    expect(JSON.stringify(result)).not.toContain('203.0.113.9');
    expect(JSON.stringify(result)).not.toContain('internal-host');
  });

  /** The OTP survived a phone-only scrubber. It sits next to the word "otp" in real messages. */
  it.each([
    'checkin failed for user with otp 424242',
    'invalid OTP: 123456 supplied',
    'code=999888 rejected',
    'pin 4242 did not match',
  ])('scrubs a code adjacent to a keyword: %j', (message) => {
    const scrubbed = scrubText(message);
    expect(scrubbed).toMatch(/\[redacted\]/);
    expect(scrubbed).not.toMatch(/\d{4,8}/);
  });

  /**
   * Money is stored in paise, so a legitimate amount is routinely six digits. Blanket-scrubbing
   * every 6-digit number would turn "insufficient balance: 250000" into a useless error, which
   * is why the keyword is required.
   */
  it.each([
    'insufficient balance: 250000 paise',
    'processed 123456 rows',
    'studio 100200 not found',
  ])('leaves an unrelated number intact: %j', (message) => {
    expect(scrubText(message)).toBe(message);
  });

  /**
   * Sentry's contextLines integration reads the source file off disk and attaches the
   * surrounding code, so a value on the throwing line travels with the event. The context is
   * kept — seeing the failing line is most of an error report's value — but scrubbed.
   */
  it('scrubs source context attached to stack frames', () => {
    const result = scrubEvent(
      event({
        exception: {
          values: [
            {
              type: 'Error',
              value: 'boom',
              stacktrace: {
                frames: [
                  {
                    filename: 'checkin.ts',
                    pre_context: ['// send to +919812345678'],
                    context_line: "throw new Error('failed for +919876543210 with otp 424242');",
                    post_context: ['}'],
                    vars: { otp: '424242', studioId: 'studio-1' },
                  },
                ],
              },
            },
          ],
        },
      }),
      {},
    );

    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain('9876543210');
    expect(serialised).not.toContain('9812345678');
    expect(serialised).not.toContain('424242');
    // The line itself survives, scrubbed — the frame is still useful.
    expect(serialised).toContain('throw new Error');
    expect(serialised).toContain('studio-1');
  });
});
