import { Writable } from 'node:stream';

import pino from 'pino';

import { buildLoggerConfig } from './logger.config';

/**
 * Redaction is tested against a REAL pino instance, not by asserting the shape of a config
 * object. A path list that looks right but does not match pino's syntax redacts nothing,
 * and the config-shape version of this test would pass anyway.
 *
 * What is at stake: phone-OTP is our only authentication factor. An OTP in a log line is a
 * complete account takeover for anyone who can read logs — the log vendor, anyone with
 * dashboard access, anyone who later receives an exported support bundle.
 */
function captureLog(payload: Record<string, unknown>, isProduction = true): string {
  const lines: string[] = [];
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });

  const config = buildLoggerConfig({ level: 'info', isProduction });
  // Transport is a child-process concern and cannot write to an in-memory stream; the
  // redaction config is what this test is about.
  const { transport: _ignored, ...options } = config as Record<string, unknown>;

  const logger = pino(options as pino.LoggerOptions, sink);
  logger.info(payload, 'test');

  return lines.join('');
}

describe('buildLoggerConfig redaction', () => {
  const SECRET = '424242';

  it.each([
    ['otp', { otp: SECRET }],
    ['password', { password: SECRET }],
    ['token', { token: SECRET }],
    ['refreshToken', { refreshToken: SECRET }],
    ['accessToken', { accessToken: SECRET }],
    ['secret', { secret: SECRET }],
  ])('redacts a top-level %s', (_name, payload) => {
    const output = captureLog(payload);

    expect(output).not.toContain(SECRET);
    expect(output).toContain('[redacted]');
  });

  it('redacts a nested otp, which is how it actually arrives', () => {
    // The realistic shape: a whole request body logged during debugging.
    const output = captureLog({ body: { phone: '+919876543210', otp: SECRET } });

    expect(output).not.toContain(SECRET);
    // The phone is deliberately NOT redacted — it is the account identifier and is needed
    // to trace a login problem. The OTP is the credential.
    expect(output).toContain('+919876543210');
  });

  /**
   * Two independent defences on headers, and this pins both.
   *
   * The `req` serializer allowlists a handful of fields, so the header bag never reaches
   * the output at all — stronger than redaction, because a header added next year is safe
   * before anyone remembers to add it to the redact list. The explicit
   * `req.headers.authorization` path remains as a second layer for any code that logs a
   * request object without going through the serializer.
   */
  it('drops the entire header bag from a serialised request', () => {
    const output = captureLog({
      req: {
        method: 'POST',
        url: '/api/v1/auth/verify',
        headers: {
          authorization: 'Bearer eyJhbGciOi.secrettoken',
          cookie: 'wc_session=abc123',
          'x-razorpay-signature': 'deadbeefsignature',
        },
      },
    });

    expect(output).not.toContain('secrettoken');
    expect(output).not.toContain('abc123');
    expect(output).not.toContain('deadbeefsignature');
    // The useful parts survive.
    expect(output).toContain('/api/v1/auth/verify');
    expect(output).toContain('POST');
  });

  it.each([
    ['authorization', 'Bearer secrettoken'],
    ['token', 'sometokenvalue'],
    ['refresh_token', 'somerefreshvalue'],
    ['razorpay_signature', 'deadbeefsignature'],
  ])('redacts a bare %s field logged outside a request', (key, value) => {
    const output = captureLog({ [key]: value });
    expect(output).not.toContain(value.split(' ').pop() as string);
  });

  it('strips the query string, which carries search terms and filters', () => {
    const output = captureLog({
      req: { method: 'GET', url: '/api/v1/members?q=rahul&phone=%2B919876543210' },
    });

    expect(output).toContain('/api/v1/members');
    expect(output).not.toContain('rahul');
  });

  it('leaves ordinary fields intact — redaction must not blind the logs', () => {
    const output = captureLog({ studioId: 'studio-1', gymId: 'gym-2', statusCode: 200 });

    expect(output).toContain('studio-1');
    expect(output).toContain('gym-2');
    expect(output).toContain('200');
  });
});

describe('buildLoggerConfig behaviour', () => {
  it('skips probe requests, which would otherwise dominate log volume', () => {
    const config = buildLoggerConfig({ level: 'info', isProduction: true });
    const ignore = (config as { autoLogging: { ignore: (req: unknown) => boolean } }).autoLogging
      .ignore;

    expect(ignore({ url: '/healthz' })).toBe(true);
    expect(ignore({ url: '/readyz' })).toBe(true);
    expect(ignore({ url: '/api/v1/gyms' })).toBe(false);
  });

  it('escalates log level with status code', () => {
    const config = buildLoggerConfig({ level: 'info', isProduction: true });
    const level = (
      config as {
        customLogLevel: (req: unknown, res: { statusCode: number }, err?: Error) => string;
      }
    ).customLogLevel;

    expect(level({}, { statusCode: 200 })).toBe('info');
    expect(level({}, { statusCode: 404 })).toBe('warn');
    expect(level({}, { statusCode: 500 })).toBe('error');
    expect(level({}, { statusCode: 200 }, new Error('boom'))).toBe('error');
  });

  describe('request id', () => {
    const genReqId = () => {
      const config = buildLoggerConfig({ level: 'info', isProduction: true });
      return (
        config as {
          genReqId: (req: unknown, res: { setHeader: (k: string, v: string) => void }) => string;
        }
      ).genReqId;
    };

    it('reuses an inbound id so a trace survives the BFF hop', () => {
      const headers: Record<string, string> = {};
      const res = { setHeader: (k: string, v: string) => (headers[k] = v) };

      const id = genReqId()({ headers: { 'x-request-id': 'from-bff' } }, res);

      expect(id).toBe('from-bff');
      // Echoed back so a user can quote it from a screenshot.
      expect(headers['x-request-id']).toBe('from-bff');
    });

    it('generates one when absent', () => {
      const res = { setHeader: () => undefined };
      const id = genReqId()({ headers: {} }, res);

      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    });

    /**
     * The inbound value is attacker-controlled and lands in every log line for the request.
     * An unbounded one is a cheap way to flood log storage.
     */
    it('rejects an oversized inbound id rather than logging it', () => {
      const res = { setHeader: () => undefined };
      const id = genReqId()({ headers: { 'x-request-id': 'x'.repeat(500) } }, res);

      expect(id).not.toContain('xxxxx');
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });
});
