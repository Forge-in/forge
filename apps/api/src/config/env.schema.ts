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

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),

    // ---- Database -----------------------------------------------------------------
    /** forge_app: owns nothing, NOBYPASSRLS. The only connection the API opens. */
    DATABASE_URL: postgresUrl,
    /** Optional replica for withTenantRead(). Falls back to DATABASE_URL. */
    DATABASE_READ_URL: postgresUrl.optional(),
    /**
     * Deliberately NOT read by the API. Declared so the schema documents the full contract
     * and the .env.example drift check has something to compare against; migrations run as
     * a separate release step, and the runtime must not hold DDL credentials.
     */
    DATABASE_MIGRATION_URL: postgresUrl.optional(),
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

    if (env.NODE_ENV === 'production' && env.CORS_ORIGINS.some((o) => o.includes('localhost'))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ORIGINS'],
        message: 'contains a localhost origin in production',
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
