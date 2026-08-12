import { z } from 'zod';

/**
 * The environment contract, validated once at boot.
 *
 * Before this existed the only env read in the API was a raw `process.env.PORT`. A missing
 * JWT_ACCESS_SECRET in production would not have failed — it would have signed every token
 * with `undefined`, producing a system where any forged token verifies.
 *
 * Rules that keep this honest:
 *   - Fail at BOOT, not at first use. A container that starts and then 500s on the login
 *     endpoint is far worse than one that never becomes healthy, because a rolling deploy
 *     will happily replace working instances with it.
 *   - No defaults for secrets. A default secret is a published secret.
 *   - Defaults are fine for things that are safe to be wrong (PORT, LOG_LEVEL).
 */

/** Reused so a stray `psql`-style URL can never be handed to the pg driver. */
const postgresUrl = z
  .string()
  .url()
  .refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
    message: 'must be a postgres:// or postgresql:// connection string',
  });

/**
 * Secrets are length-checked rather than merely present. `JWT_ACCESS_SECRET=changeme` is a
 * configured value and would pass a presence check, which is exactly how placeholder
 * secrets reach production.
 */
const strongSecret = z
  .string()
  .min(32, 'must be at least 32 characters — generate with `openssl rand -base64 48`')
  .refine((value) => !/^(change_?me|secret|password|test)/i.test(value), {
    message: 'looks like a placeholder from .env.example',
  });

/** Accepts "900" or "15m"; TTLs are compared as seconds everywhere downstream. */
const seconds = z.coerce.number().int().positive();

/**
 * Treats an empty value as absent.
 *
 * `.env` files are full of empty placeholders — `.env.example` ships `MSG91_AUTH_KEY=` so a
 * developer can see the key exists. Without this, that line is a PRESENT variable holding
 * "", which fails `.min(1)` and makes `.optional()` useless. The API then refuses to boot
 * over a variable nobody meant to set, which teaches people to delete lines from
 * .env.example — and then the real ones go missing too.
 */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),

    // ---- Database -----------------------------------------------------------------
    /** forge_app: owns nothing, NOBYPASSRLS. The only connection the API opens. */
    DATABASE_URL: postgresUrl,
    /** Optional replica for withTenantRead(). Falls back to DATABASE_URL. */
    DATABASE_READ_URL: optional(postgresUrl),
    /**
     * Deliberately NOT read by the API. Declared so the schema documents the full contract
     * and the .env.example drift check has something to compare against; migrations run as
     * a separate release step, and the runtime must not hold DDL credentials.
     */
    DATABASE_MIGRATION_URL: optional(postgresUrl),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

    // ---- Redis --------------------------------------------------------------------
    // Required, not optional: rate limiting and idempotency are correctness features, and
    // an in-memory fallback silently stops working the moment a second container starts.
    REDIS_URL: z.string().url(),

    // ---- Auth ---------------------------------------------------------------------
    JWT_ACCESS_SECRET: strongSecret,
    JWT_REFRESH_SECRET: strongSecret,
    JWT_ACCESS_TTL: seconds.default(900),
    JWT_REFRESH_TTL: seconds.default(2_592_000),

    /**
     * Company admin console session lifetimes. Separate from the member app's on purpose.
     *
     * Thirty days of silent refresh is the right answer for a phone in a member's pocket:
     * the alternative is an SMS code every month to check into a gym. It is the wrong answer
     * for a console that can reach every tenant on the platform, where a laptop left open in
     * a cafe should stop being a valid session the same day.
     *
     * Twelve hours is a working day plus slack, so an administrator signs in roughly once a
     * day rather than being bounced to an OTP screen mid-task. The secrets are shared with
     * the member tokens; the `aud` claim is what keeps the two apart, not a third key —
     * another secret to rotate would be more moving parts for no additional property.
     */
    JWT_CONSOLE_ACCESS_TTL: seconds.default(900),
    JWT_CONSOLE_REFRESH_TTL: seconds.default(43_200),

    // ---- OTP delivery (MSG91) -----------------------------------------------------
    // Optional here and required in production by the superRefine below, because DLT
    // approval takes 1-3 weeks and every other part of auth has to be buildable meanwhile.
    // Without credentials outside production, codes are logged instead of sent.
    MSG91_AUTH_KEY: optional(z.string().min(1)),
    MSG91_OTP_TEMPLATE_ID: optional(z.string().min(1)),
    MSG91_SENDER_ID: optional(z.string()),

    /**
     * OTP abuse limits, configurable rather than hardcoded.
     *
     * Two reasons. Operationally, these are the dial you reach for during an attack or when
     * a legitimate pattern turns out to be tighter than expected — and needing a deploy to
     * turn it means the attack wins for however long the pipeline takes.
     *
     * Practically, the per-IP limit made the test suite untestable: every request in CI
     * comes from 127.0.0.1, so the eleventh call blocked everything after it. A security
     * control that cannot be exercised is one nobody notices breaking.
     *
     * Defaults are the production values. The per-phone limit stays small in tests, since
     * each test uses a fresh number and that is the limit worth exercising end to end.
     */
    OTP_MAX_PER_PHONE: z.coerce.number().int().positive().default(3),
    OTP_MAX_PER_IP: z.coerce.number().int().positive().default(10),

    /**
     * The same dials for the company admin console, counted in their own Redis buckets.
     *
     * Separate rather than shared because the two surfaces fail in opposite directions.
     * A shared per-IP bucket punishes administrators for sitting behind one office NAT with
     * the whole member population's traffic — and, worse, lets anyone who knows an
     * administrator's number exhaust their per-phone budget from the public member endpoint
     * and lock them out of the console during an incident.
     *
     * The per-phone allowance is deliberately a little higher than the member one: an
     * administrator being paged at 3am gets more than three attempts to receive a code on a
     * bad network. The per-IP allowance is what actually bounds abuse here, since there are
     * only ever a handful of legitimate numbers.
     */
    ADMIN_OTP_MAX_PER_PHONE: z.coerce.number().int().positive().default(5),
    ADMIN_OTP_MAX_PER_IP: z.coerce.number().int().positive().default(20),

    /**
     * How long a console invite stays usable when the caller does not say.
     *
     * Bounded at the contract level too (1 hour to 14 days, see admin-auth.contract.ts).
     * This is only the default a console form gets for free.
     */
    ADMIN_INVITE_TTL_HOURS: z.coerce.number().int().min(1).max(336).default(72),

    /**
     * Global request floor, per IP. Same reasoning as the OTP limits: an operational dial
     * that must not require a deploy to turn, and a control that has to stay exercisable.
     *
     * These are NOT disabled in tests. A limiter that switches itself off in every test
     * environment is one that can break silently — the suite simply runs with headroom.
     */
    THROTTLE_PER_SECOND: z.coerce.number().int().positive().default(20),
    THROTTLE_PER_MINUTE: z.coerce.number().int().positive().default(200),

    /**
     * A phone number that accepts a fixed code, for App Store and Play review.
     *
     * Reviewers sit outside India and cannot receive an Indian SMS, which is a common and
     * genuinely surprising cause of rejection for OTP-only apps. Both variables must be set
     * together, the number must be a real one we control, and production is expected to
     * carry it deliberately rather than by accident — hence it is logged loudly at boot.
     */
    DEMO_PHONE: optional(z.string()),
    DEMO_OTP: optional(z.string().regex(/^\d{6}$/)),

    // ---- HTTP ---------------------------------------------------------------------
    /**
     * Comma-separated exact origins. No wildcard: with `credentials: true` a wildcard is
     * rejected by browsers anyway, and reflecting arbitrary origins defeats the point.
     */
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:3000,http://localhost:3001')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    /** Hops to trust for X-Forwarded-For. 1 behind a single load balancer. */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(1),

    // ---- Observability ------------------------------------------------------------
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    /**
     * Error reporting. Absent means DISABLED — no SDK init, no events, no cost.
     *
     * Not required in production even though it should be set there: a missing DSN must
     * degrade to "no error reporting", never to "refuses to boot". Losing visibility is
     * bad; an API that will not start because its telemetry is unconfigured is worse.
     */
    SENTRY_DSN: optional(z.string().url()),
    SENTRY_ENVIRONMENT: optional(z.string()),
    /** Build identity, surfaced on /healthz so "which build is on staging" has an answer. */
    GIT_SHA: z.string().default('unknown'),
    BUILT_AT: z.string().default('unknown'),
  })
  .superRefine((env, ctx) => {
    // Cross-field rules. Kept here rather than in each field so the error names the real
    // problem instead of a field that is individually valid.
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message:
          'must differ from JWT_ACCESS_SECRET — sharing them lets a refresh token be ' +
          'presented as an access token',
      });
    }

    if (env.JWT_ACCESS_TTL > env.JWT_REFRESH_TTL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_ACCESS_TTL'],
        message: 'must not outlive JWT_REFRESH_TTL',
      });
    }

    // Same invariant on the console pair. An access token outliving the refresh token it is
    // renewed by produces a session that 401s with nothing able to fix it.
    if (env.JWT_CONSOLE_ACCESS_TTL > env.JWT_CONSOLE_REFRESH_TTL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_CONSOLE_ACCESS_TTL'],
        message: 'must not outlive JWT_CONSOLE_REFRESH_TTL',
      });
    }

    /**
     * The console must not be the LONGER-lived session.
     *
     * If someone raises the console refresh TTL past the member one while tuning something
     * else, the surface that can see every tenant quietly becomes the one that stays signed
     * in longest — the exact inversion the split TTLs exist to prevent. It is caught at boot
     * because nothing else would ever surface it.
     */
    if (env.JWT_CONSOLE_REFRESH_TTL > env.JWT_REFRESH_TTL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_CONSOLE_REFRESH_TTL'],
        message:
          'must not exceed JWT_REFRESH_TTL — the company admin console reaches every tenant, ' +
          'so its sessions must not outlive the member apps',
      });
    }

    if (env.NODE_ENV === 'production' && env.CORS_ORIGINS.some((o) => o.includes('localhost'))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ORIGINS'],
        message: 'contains a localhost origin in production',
      });
    }

    /**
     * Production must be able to actually deliver a code. Without this the API starts
     * healthy, every dashboard is green, and nobody can sign in — the failure only shows up
     * as users quietly not arriving.
     */
    if (env.NODE_ENV === 'production' && (!env.MSG91_AUTH_KEY || !env.MSG91_OTP_TEMPLATE_ID)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MSG91_AUTH_KEY'],
        message:
          'MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID are both required in production — ' +
          'phone OTP is the only way in, so an unconfigured gateway means nobody can log in',
      });
    }

    // Half-configured is worse than either: a DEMO_PHONE with no code silently does
    // nothing, and a DEMO_OTP with no phone number is an unbound backdoor.
    if (Boolean(env.DEMO_PHONE) !== Boolean(env.DEMO_OTP)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DEMO_PHONE'],
        message: 'DEMO_PHONE and DEMO_OTP must be set together, or not at all',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Validates and returns the environment, or throws with every problem listed at once.
 *
 * Reporting all failures together is deliberate: fixing one variable, redeploying, and
 * discovering the next one is a slow loop, and it usually happens during an incident.
 */
export function validateEnv(source: Record<string, unknown>): Env {
  const result = envSchema.safeParse(source);

  if (result.success) return result.data;

  const problems = result.error.issues
    .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');

  throw new Error(
    `Invalid environment — the API cannot start.\n\n${problems}\n\n` +
      'See .env.example for the full contract.',
  );
}
