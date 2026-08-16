import { randomUUID } from 'node:crypto';

import type { Params } from 'nestjs-pino';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { REQUEST_ID_HEADER } from '../request-context';

/**
 * Fields scrubbed from every log line.
 *
 * This list is security-critical, not hygiene. An OTP in a log line is a full account
 * takeover for anyone who can read logs — which includes the log vendor, anyone with
 * dashboard access, and anyone who later receives an exported support bundle. Phone-OTP is
 * our only authentication factor, so there is no second barrier behind it.
 *
 * Redaction happens at the logger, not at call sites, because the dangerous case is the
 * one nobody thought about: an error object serialised whole, a request body dumped during
 * debugging, a third-party library logging its own input.
 */
/** Key names that must never reach a log line, wherever they appear. */
const SENSITIVE_KEYS = [
  'otp',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'access_token',
  'refresh_token',
  'secret',
  'authorization',
  'razorpay_signature',
  'apiKey',
  'api_key',
];

/**
 * Pino's `*` matches exactly ONE level — it is not a recursive glob. So `*.otp` redacts
 * `body.otp` but leaves a top-level `otp` completely untouched, and `**` is not supported.
 *
 * That is not a hypothetical: the first version of this file listed only `*.otp`, and a
 * test against a real pino instance showed `logger.info({ otp })` writing the code out in
 * full. The depths are therefore enumerated explicitly rather than assumed.
 *
 * Depth 3 covers the realistic worst case, `req.body.user.otp`. Anything deeper than that
 * is a whole object being dumped, which is its own problem.
 */
const DEPTHS = ['', '*.', '*.*.', '*.*.*.'];

const REDACTED_PATHS = [
  // Explicit header paths: these are the ones that carry a live credential on every
  // request, so they are listed by name rather than relying on the key sweep below.
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.headers["x-razorpay-signature"]',
  'res.headers["set-cookie"]',

  ...DEPTHS.flatMap((prefix) => SENSITIVE_KEYS.map((key) => `${prefix}${key}`)),
];

export function buildLoggerConfig(options: {
  level: string;
  isProduction: boolean;
}): NonNullable<Params['pinoHttp']> {
  return {
    level: options.level,

    /**
     * Trust an inbound x-request-id so a trace survives the BFF hop from the Next apps,
     * but cap its length: it is attacker-controlled and ends up in every log line, where an
     * unbounded value is a cheap way to flood storage.
     */
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const inbound = req.headers[REQUEST_ID_HEADER];
      const candidate = Array.isArray(inbound) ? inbound[0] : inbound;
      const id =
        candidate && candidate.length > 0 && candidate.length <= 64 ? candidate : randomUUID();

      // Echoed so a user can quote it and support can find the line immediately.
      res.setHeader(REQUEST_ID_HEADER, id);
      return id;
    },

    redact: { paths: REDACTED_PATHS, censor: '[redacted]' },

    // Health probes fire every few seconds forever; at info level they would be the
    // overwhelming majority of log volume and would bury everything worth reading.
    autoLogging: {
      ignore: (req: IncomingMessage) => req.url === '/healthz' || req.url === '/readyz',
    },

    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },

    /**
     * Trim the serialised request to what is actually useful. The default pino-http
     * serialiser includes the full header set, which is both noisy and a standing risk that
     * a newly added header carrying a secret gets logged before anyone adds it to REDACTED_PATHS.
     */
    serializers: {
      // Optional chaining on headers is not defensive clutter: a serializer that throws
      // loses the log line entirely, and the lines most worth keeping are the ones emitted
      // from unusual states where the request may be partly constructed.
      req: (req: IncomingMessage & { id?: string; method?: string; url?: string }) => ({
        id: req.id,
        method: req.method,
        // Query strings carry search terms and filter values; the path alone is enough.
        url: req.url?.split('?')[0],
        clientApp: req.headers?.['x-client-app'],
        clientVersion: req.headers?.['x-client-version'],
      }),
      res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
    },

    // Pretty output locally; newline-delimited JSON in production, which is what every log
    // aggregator expects and what makes fields queryable rather than grep-able.
    ...(options.isProduction
      ? {}
      : {
          transport: {
            target: 'pino-pretty',
            options: { singleLine: true, colorize: true, translateTime: 'HH:MM:ss.l' },
          },
        }),
  };
}
