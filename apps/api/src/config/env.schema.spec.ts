import { validateEnv } from './env.schema';

/**
 * The environment contract is the first thing that runs and the last thing anyone checks.
 * Every case here is a misconfiguration that would otherwise reach production and fail
 * somewhere far away from its cause.
 */

const SECRET_A = 'a'.repeat(48);
const SECRET_B = 'b'.repeat(48);

const validEnv = (): Record<string, unknown> => ({
  DATABASE_URL: 'postgresql://forge_app:pw@localhost:5432/forge',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: SECRET_A,
  JWT_REFRESH_SECRET: SECRET_B,
});

describe('validateEnv', () => {
  it('accepts a minimal valid environment and applies defaults', () => {
    const env = validateEnv(validEnv());

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.JWT_ACCESS_TTL).toBe(900);
    expect(env.JWT_REFRESH_TTL).toBe(2_592_000);
    expect(env.DATABASE_POOL_MAX).toBe(10);
  });

  it('coerces numeric strings, because every env var arrives as a string', () => {
    const env = validateEnv({ ...validEnv(), PORT: '8080', JWT_ACCESS_TTL: '600' });

    expect(env.PORT).toBe(8080);
    expect(typeof env.PORT).toBe('number');
    expect(env.JWT_ACCESS_TTL).toBe(600);
  });

  it('splits CORS_ORIGINS into trimmed entries', () => {
    const env = validateEnv({
      ...validEnv(),
      CORS_ORIGINS: 'https://a.example , https://b.example',
    });

    expect(env.CORS_ORIGINS).toEqual(['https://a.example', 'https://b.example']);
  });

  describe('secrets', () => {
    /**
     * The failure this whole module exists to prevent: without validation a missing secret
     * is `undefined`, tokens get signed with it, and any forged token verifies.
     */
    it('refuses to start when JWT_ACCESS_SECRET is missing', () => {
      const { JWT_ACCESS_SECRET: _omitted, ...rest } = validEnv();
      expect(() => validateEnv(rest)).toThrow(/JWT_ACCESS_SECRET/);
    });

    it('rejects a short secret', () => {
      expect(() => validateEnv({ ...validEnv(), JWT_ACCESS_SECRET: 'short' })).toThrow(
        /at least 32 characters/,
      );
    });

    // "Present" is not the same as "configured" — this is exactly how the value from
    // .env.example reaches production.
    it.each([
      'change_me_access',
      'changeme_but_long_enough_to_pass_length_check',
      'secret'.repeat(8),
    ])('rejects the placeholder %j', (value) => {
      expect(() => validateEnv({ ...validEnv(), JWT_ACCESS_SECRET: value })).toThrow();
    });

    it('rejects identical access and refresh secrets', () => {
      expect(() =>
        validateEnv({ ...validEnv(), JWT_ACCESS_SECRET: SECRET_A, JWT_REFRESH_SECRET: SECRET_A }),
      ).toThrow(/must differ/);
    });

    it('rejects an access token that outlives its refresh token', () => {
      expect(() =>
        validateEnv({ ...validEnv(), JWT_ACCESS_TTL: '99999', JWT_REFRESH_TTL: '60' }),
      ).toThrow(/must not outlive/);
    });
  });

  describe('connection strings', () => {
    it.each([
      ['mysql://user:pw@localhost:3306/forge', 'wrong driver'],
      ['not-a-url', 'not a url at all'],
      ['', 'empty'],
    ])('rejects DATABASE_URL %j — %s', (value) => {
      expect(() => validateEnv({ ...validEnv(), DATABASE_URL: value })).toThrow(/DATABASE_URL/);
    });

    it.each(['postgres://u:p@h:5432/d', 'postgresql://u:p@h:5432/d'])('accepts %s', (value) => {
      expect(() => validateEnv({ ...validEnv(), DATABASE_URL: value })).not.toThrow();
    });

    // Redis is required, not optional: rate limiting and idempotency are correctness
    // features, and an in-memory fallback stops working the moment a second container runs.
    it('requires REDIS_URL', () => {
      const { REDIS_URL: _omitted, ...rest } = validEnv();
      expect(() => validateEnv(rest)).toThrow(/REDIS_URL/);
    });
  });

  describe('production guards', () => {
    it('rejects a localhost CORS origin in production', () => {
      expect(() =>
        validateEnv({
          ...validEnv(),
          NODE_ENV: 'production',
          CORS_ORIGINS: 'https://admin.forge.in,http://localhost:3000',
        }),
      ).toThrow(/localhost origin in production/);
    });

    it('allows real origins in production', () => {
      expect(() =>
        validateEnv({
          ...validEnv(),
          NODE_ENV: 'production',
          CORS_ORIGINS: 'https://admin.forge.in',
        }),
      ).not.toThrow();
    });
  });

  /**
   * Reporting every problem at once matters more than it looks: fixing one variable,
   * redeploying, and discovering the next one is a slow loop, and it happens during an
   * incident when the environment is already wrong.
   */
  it('reports every problem in one message rather than the first', () => {
    let message = '';
    try {
      validateEnv({ DATABASE_URL: 'nope', REDIS_URL: 'also-nope' });
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }

    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('REDIS_URL');
    expect(message).toContain('JWT_ACCESS_SECRET');
    expect(message).toContain('JWT_REFRESH_SECRET');
  });

  it('names .env.example so the fix is discoverable', () => {
    expect(() => validateEnv({})).toThrow(/\.env\.example/);
  });

  it('rejects an out-of-range port instead of letting listen() fail later', () => {
    expect(() => validateEnv({ ...validEnv(), PORT: '99999' })).toThrow(/PORT/);
    expect(() => validateEnv({ ...validEnv(), PORT: '0' })).toThrow(/PORT/);
  });
});
