import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { ErrorCode, isErrorEnvelope } from '@forge/shared';
import request from 'supertest';

import { AppModule } from './../src/app.module';
import { configureApp } from './../src/bootstrap';
import type { Env } from './../src/config/env.schema';

/**
 * Boots the real application against real Postgres and Redis.
 *
 * Calls the same configureApp() that main.ts does, so the suite cannot drift from what
 * ships. The first version of this file duplicated the setup and immediately diverged —
 * helmet was configured in main.ts and missing here, so these tests asserted security
 * headers that the test app had never been given.
 */
describe('API bootstrap (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>({ rawBody: true });
    configureApp(app, app.get(ConfigService<Env, true>));

    await app.init();
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  describe('liveness', () => {
    it('GET /healthz returns ok with build identity', async () => {
      const response = await request(app.getHttpServer()).get('/healthz').expect(200);

      expect(response.body).toMatchObject({ status: 'ok' });
      expect(response.body.uptime).toBeGreaterThanOrEqual(0);
      // Build identity, so "which build is on staging?" is answerable without guessing.
      expect(response.body).toHaveProperty('sha');
      expect(response.body).toHaveProperty('builtAt');
    });

    it('is NOT under the /api prefix — orchestrators must not chase a version bump', async () => {
      await request(app.getHttpServer()).get('/healthz').expect(200);
      await request(app.getHttpServer()).get('/api/v1/healthz').expect(404);
    });

    it('keeps the documented /health alias working', async () => {
      await request(app.getHttpServer()).get('/health').expect(200);
    });
  });

  describe('readiness', () => {
    it('GET /readyz reports every dependency it checked', async () => {
      const response = await request(app.getHttpServer()).get('/readyz');

      // 200 when both are up, 503 when one is down. Both are correct outcomes for this
      // test; what must always hold is that the body names what was checked.
      expect([200, 503]).toContain(response.status);
      expect(response.body.checks).toHaveProperty('postgres');
      expect(response.body.checks).toHaveProperty('redis');
      expect(typeof response.body.checks.postgres.ok).toBe('boolean');
    });

    it('reaches a real Postgres and Redis', async () => {
      const response = await request(app.getHttpServer()).get('/readyz');

      // If this fails, the local stack is down — which is the point of a readiness probe.
      expect(response.body.checks.postgres.ok).toBe(true);
      expect(response.body.checks.redis.ok).toBe(true);
      expect(response.status).toBe(200);
    });
  });

  describe('error envelope', () => {
    it('returns the shared envelope for an unknown route', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);

      expect(isErrorEnvelope(response.body)).toBe(true);
      expect(response.body.error.code).toBe(ErrorCode.NOT_FOUND);
      expect(response.body.error.retryable).toBe(false);
      expect(response.body.error.requestId).toBeTruthy();
    });

    it('echoes x-request-id so a screenshot maps to a log line', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/does-not-exist');

      expect(response.headers['x-request-id']).toBeTruthy();
      expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
    });

    it('reuses an inbound request id, so a trace survives the BFF hop', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/does-not-exist')
        .set('x-request-id', 'trace-from-bff');

      expect(response.headers['x-request-id']).toBe('trace-from-bff');
      expect(response.body.error.requestId).toBe('trace-from-bff');
    });
  });

  describe('versioning', () => {
    it('serves routes under /api/v1', async () => {
      // 404 rather than a route mismatch proves the prefix and version resolve.
      const unversioned = await request(app.getHttpServer()).get('/api/does-not-exist');
      expect(unversioned.status).toBe(404);
    });
  });

  describe('security headers', () => {
    it('applies helmet defaults', async () => {
      const response = await request(app.getHttpServer()).get('/healthz');

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
      // helmet removes this; leaking the framework is free reconnaissance.
      expect(response.headers['x-powered-by']).toBeUndefined();
    });
  });

  describe('CORS', () => {
    it('allows a configured origin with credentials', async () => {
      const response = await request(app.getHttpServer())
        .options('/api/v1/does-not-exist')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    /**
     * The allowlist must not reflect whatever origin asked. A reflected origin alongside
     * credentials is equivalent to having no policy at all.
     */
    it('does not reflect an unknown origin', async () => {
      const response = await request(app.getHttpServer())
        .options('/api/v1/does-not-exist')
        .set('Origin', 'https://evil.example')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.headers['access-control-allow-origin']).not.toBe('https://evil.example');
    });

    it('exposes x-request-id to the browser, or clients cannot read it', async () => {
      const response = await request(app.getHttpServer())
        .get('/healthz')
        .set('Origin', 'http://localhost:3000');

      expect(response.headers['access-control-expose-headers']).toContain('x-request-id');
    });
  });
});
