import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ErrorCode } from '@forge/shared';
import request from 'supertest';

import { AppModule } from './../src/app.module';
import { configureApp } from './../src/bootstrap';
import type { Env } from './../src/config/env.schema';
import { AppConfigService } from './../src/modules/app-config/app-config.service';

/**
 * The forced-upgrade mechanism, against real Redis.
 *
 * This has to work before the first store release, because **you cannot roll back an App
 * Store release**. If v1.0.0 ships without it, every user on that build is permanently
 * unforceable and its API contract has to be supported indefinitely.
 */
describe('client version enforcement (e2e)', () => {
  let app: NestExpressApplication;
  let appConfig: AppConfigService;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication<NestExpressApplication>({ rawBody: true });
    configureApp(app, app.get(ConfigService<Env, true>));
    appConfig = app.get(AppConfigService);
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  const mobileHeaders = (version: string) => ({
    'x-client-app': 'user-mobile',
    'x-client-version': version,
    'x-client-platform': 'ios',
  });

  describe('GET /api/v1/app-config', () => {
    /**
     * Unauthenticated by design: an app too old to sign in still has to be told to update,
     * and a maintenance window has to be announceable to users who cannot authenticate.
     */
    it('is reachable without a token', async () => {
      const response = await http()
        .get('/api/v1/app-config')
        .query({ app: 'user-mobile', platform: 'ios' })
        .expect(200);

      expect(response.body).toHaveProperty('minSupported');
      expect(response.body).toHaveProperty('flags');
    });

    /**
     * A missing or unreadable release policy must NOT lock everyone out. Failing closed here
     * would turn a Redis blip into a total outage for every mobile client.
     */
    it('defaults to permissive when nothing is configured', async () => {
      const response = await http()
        .get('/api/v1/app-config')
        .query({ app: 'never-configured', platform: 'android' })
        .expect(200);

      expect(response.body.minSupported).toBe('0.0.0');
      expect(response.body.maintenance).toBe(false);
    });
  });

  describe('the version floor', () => {
    beforeEach(async () => {
      await appConfig.set('user-mobile', 'ios', {
        minSupported: '2.0.0',
        latest: '2.1.0',
        message: 'Please update Forge to continue.',
        storeUrl: 'https://apps.apple.com/app/id000000',
        maintenance: false,
        flags: {},
      });
    });

    afterEach(async () => {
      await appConfig.set('user-mobile', 'ios', {
        minSupported: '0.0.0',
        latest: '0.0.0',
        message: 'ok',
        maintenance: false,
        flags: {},
      });
    });

    it('rejects an outdated build with 426 and a store link', async () => {
      const response = await http().get('/healthz').set(mobileHeaders('1.9.0'));

      expect(response.status).toBe(426);
      expect(response.body.error.code).toBe(ErrorCode.CLIENT_TOO_OLD);
      expect(response.body.error.message).toBe('Please update Forge to continue.');
      // A blocking screen with no way forward is indistinguishable from a broken app.
      expect(response.body.error.details?.[0]?.message).toContain('apps.apple.com');
    });

    it('allows a build at the floor', async () => {
      await http().get('/healthz').set(mobileHeaders('2.0.0')).expect(200);
    });

    it('allows a newer build', async () => {
      await http().get('/healthz').set(mobileHeaders('2.5.0')).expect(200);
    });

    /**
     * String comparison gets this backwards — "1.10.0" < "1.9.0" lexicographically — which
     * would reject a NEWER build as too old. That is a self-inflicted outage for exactly the
     * users who did update.
     */
    it('compares versions numerically, not lexicographically', async () => {
      await appConfig.set('user-mobile', 'ios', {
        minSupported: '1.9.0',
        latest: '1.10.0',
        message: 'update',
        maintenance: false,
        flags: {},
      });

      await http().get('/healthz').set(mobileHeaders('1.10.0')).expect(200);
      expect((await http().get('/healthz').set(mobileHeaders('1.8.9'))).status).toBe(426);
    });

    /**
     * The floor never applies to web: a browser gets the new bundle on reload, so there is
     * no stale install to force. Blocking it would break the dashboards on every bump.
     */
    it('never blocks a web client', async () => {
      await http()
        .get('/healthz')
        .set({
          'x-client-app': 'gym-owner',
          'x-client-version': '0.0.1',
          'x-client-platform': 'web',
        })
        .expect(200);
    });

    /**
     * An unidentified caller — curl, a probe, a server-to-server call — is allowed through.
     * The consequence is that a mobile build which omits the headers escapes the check
     * entirely, which is why @forge/api-client always sends them.
     */
    it('allows a caller that sends no client headers', async () => {
      await http().get('/healthz').expect(200);
    });

    it('ignores a platform it does not recognise rather than failing the request', async () => {
      await http()
        .get('/healthz')
        .set({
          'x-client-app': 'user-mobile',
          'x-client-version': '0.0.1',
          'x-client-platform': 'blackberry',
        })
        .expect(200);
    });
  });

  describe('maintenance mode', () => {
    afterEach(async () => {
      await appConfig.set('user-mobile', 'android', {
        minSupported: '0.0.0',
        latest: '0.0.0',
        message: 'ok',
        maintenance: false,
        flags: {},
      });
    });

    /**
     * Lets a migration window show a real explanation instead of the generic error every
     * failing request would otherwise produce.
     */
    it('returns 503 with the configured message', async () => {
      await appConfig.set('user-mobile', 'android', {
        minSupported: '0.0.0',
        latest: '1.0.0',
        message: 'update',
        maintenance: true,
        maintenanceMessage: 'Back at 3am IST — upgrading the database.',
        flags: {},
      });

      const response = await http().get('/healthz').set({
        'x-client-app': 'user-mobile',
        'x-client-version': '1.0.0',
        'x-client-platform': 'android',
      });

      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe(ErrorCode.SERVICE_UNAVAILABLE);
      expect(response.body.error.message).toContain('3am IST');
      // Retryable, so a client backs off and tries again rather than signing the user out.
      expect(response.body.error.retryable).toBe(true);
    });
  });
});
