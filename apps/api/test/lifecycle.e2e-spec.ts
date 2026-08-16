import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { pingDatabase } from '@forge/db';

import { AppModule } from './../src/app.module';
import { configureApp } from './../src/bootstrap';
import { validateEnv } from './../src/config/env.schema';
import type { Env } from './../src/config/env.schema';

/**
 * Boot and shutdown behaviour.
 *
 * In its own file because both halves mutate process-wide state — the database singleton
 * and process.env — and jest gives each test file a fresh module registry.
 */
describe('application lifecycle (e2e)', () => {
  describe('graceful shutdown', () => {
    /**
     * Without enableShutdownHooks() + onApplicationShutdown, every deploy and every
     * autoscale event severs in-flight queries mid-transaction. That surfaces as a burst
     * of 500s on each release, and gets blamed on whatever was being deployed rather than
     * on the deploy mechanism itself.
     *
     * Proven by observing that the pool is genuinely gone afterwards, not by asserting
     * that a mock was called.
     */
    it('closes the database pools on shutdown', async () => {
      const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
      const app = moduleFixture.createNestApplication<NestExpressApplication>({ rawBody: true });
      configureApp(app, app.get(ConfigService<Env, true>));
      app.enableShutdownHooks();
      await app.init();

      // Live before shutdown.
      await expect(pingDatabase()).resolves.toBeUndefined();

      await app.close();

      // Gone after. The pool is not merely idle — it no longer exists.
      await expect(pingDatabase()).rejects.toThrow(/not initialised/i);
    }, 30_000);
  });

  describe('boot-time environment validation', () => {
    /**
     * The whole point of validating at boot: a container that starts and then fails on the
     * login endpoint is far worse than one that never becomes healthy, because a rolling
     * deploy will happily replace working instances with it.
     */
    it('refuses to start when a secret is missing', () => {
      const incomplete = {
        DATABASE_URL: 'postgresql://forge_app:pw@localhost:5432/forge',
        REDIS_URL: 'redis://localhost:6379',
      };

      expect(() => validateEnv(incomplete)).toThrow(/JWT_ACCESS_SECRET/);
    });

    it('refuses to start on a placeholder secret copied from .env.example', () => {
      expect(() =>
        validateEnv({
          DATABASE_URL: 'postgresql://forge_app:pw@localhost:5432/forge',
          REDIS_URL: 'redis://localhost:6379',
          JWT_ACCESS_SECRET: 'change_me_access',
          JWT_REFRESH_SECRET: 'change_me_refresh',
        }),
      ).toThrow();
    });

    it('accepts the environment this suite is actually running with', () => {
      // Guards against the schema drifting away from .env.example: if a developer's working
      // .env stops satisfying the schema, this fails here rather than at the next deploy.
      expect(() => validateEnv(process.env)).not.toThrow();
    });
  });
});
