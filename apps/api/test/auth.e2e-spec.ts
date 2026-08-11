import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { ErrorCode } from '@forge/shared';
import {
  gyms,
  memberships,
  runAsSystem,
  studios,
  takeFirstOrThrow,
  users,
  withTenant,
} from '@forge/db';
import request from 'supertest';

import { AppModule } from './../src/app.module';
import { configureApp } from './../src/bootstrap';
import type { Env } from './../src/config/env.schema';
import { OTP_TRANSPORT } from './../src/modules/auth/auth.module';
import type { OtpTransport } from './../src/modules/auth/otp-transport';

/**
 * Authentication, end to end against real Postgres and Redis.
 *
 * Every case here is a specific way phone-OTP auth gets broken in production. They are
 * written as attacks — perform the thing that must not work, assert it did not.
 *
 * Phone numbers are randomised per test because the OTP rate limits are per phone and
 * persist in Redis for fifteen minutes; a fixed number would make the suite pass once and
 * then fail for the rest of the window.
 */

/** Captures codes instead of sending SMS, so tests can complete a real sign-in. */
class RecordingTransport implements OtpTransport {
  readonly name = 'recording';
  readonly sent: { phone: string; code: string }[] = [];

  send(phone: string, code: string): Promise<void> {
    this.sent.push({ phone, code });
    return Promise.resolve();
  }

  lastCodeFor(phone: string): string {
    const entry = [...this.sent].reverse().find((s) => s.phone === phone);
    if (!entry) throw new Error(`No code was sent to ${phone}`);
    return entry.code;
  }
}

const randomPhone = (): string =>
  `+919${Math.floor(100000000 + Math.random() * 899999999)}`.slice(0, 13);

describe('auth (e2e)', () => {
  let app: NestExpressApplication;
  let transport: RecordingTransport;
  let studioId: string;
  let studioName: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    transport = new RecordingTransport();

    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OTP_TRANSPORT)
      .useValue(transport)
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>({ rawBody: true });
    configureApp(app, app.get(ConfigService<Env, true>));
    await app.init();

    studioId = randomUUID();
    studioName = `Test Studio ${studioId.slice(0, 8)}`;
    await withTenant(studioId, async (tx) => {
      await tx
        .insert(studios)
        .values({ id: studioId, name: studioName, slug: `s-${studioId.slice(0, 12)}` });
      await tx
        .insert(gyms)
        .values({ studioId, name: 'Branch A', code: `A${studioId.slice(0, 6)}` });
    });
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  /** Registers a phone in the test studio, the way a gym owner adding a member would. */
  async function enrol(phone: string, role = 'gym_user'): Promise<string> {
    const userId = await runAsSystem(
      'test:create-user',
      async (tx) =>
        takeFirstOrThrow(await tx.insert(users).values({ phone }).returning({ id: users.id })).id,
    );

    await withTenant(studioId, async (tx) => {
      await tx.insert(memberships).values({ studioId, userId, role });
    });

    return userId;
  }

  async function signIn(phone: string): Promise<{ accessToken: string; refreshToken: string }> {
    await http().post('/api/v1/auth/request-otp').send({ phone }).expect(200);
    const code = transport.lastCodeFor(phone);

    const response = await http()
      .post('/api/v1/auth/verify-otp')
      .send({ phone, otp: code })
      .expect(200);
    return response.body.tokens;
  }

  describe('requesting a code', () => {
    it('sends one and reports the resend cooldown', async () => {
      const phone = randomPhone();
      const response = await http().post('/api/v1/auth/request-otp').send({ phone }).expect(200);

      expect(response.body).toMatchObject({ status: 'sent' });
      expect(response.body.retryAfterSeconds).toBeGreaterThan(0);
      expect(transport.lastCodeFor(phone)).toMatch(/^\d{6}$/);
    });

    /**
     * The membership oracle. If an unregistered number answered differently, anyone could
     * enumerate which phone numbers belong to a gym on this platform.
     */
    it('answers identically for a number that belongs to nobody', async () => {
      const unknown = await http().post('/api/v1/auth/request-otp').send({ phone: randomPhone() });

      const enrolled = randomPhone();
      await enrol(enrolled);
      const known = await http().post('/api/v1/auth/request-otp').send({ phone: enrolled });

      expect(unknown.status).toBe(known.status);
      expect(Object.keys(unknown.body).sort()).toEqual(Object.keys(known.body).sort());
      expect(unknown.body.status).toBe(known.body.status);
    });

    it('rejects a malformed number before spending an SMS', async () => {
      const before = transport.sent.length;
      const response = await http().post('/api/v1/auth/request-otp').send({ phone: '9876543210' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(response.body.error.details?.[0]?.path).toBe('phone');
      expect(transport.sent.length).toBe(before);
    });

    // Every request is real money on a real invoice, which is what makes this endpoint
    // worth pointing a script at.
    it('rate limits after three codes for one number', async () => {
      const phone = randomPhone();
      for (let i = 0; i < 3; i += 1) {
        await http().post('/api/v1/auth/request-otp').send({ phone }).expect(200);
      }

      const blocked = await http().post('/api/v1/auth/request-otp').send({ phone });
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe(ErrorCode.RATE_LIMITED);
      expect(blocked.body.error.retryable).toBe(true);
      expect(blocked.headers['retry-after']).toBeDefined();
    });
  });

  describe('verifying a code', () => {
    it('signs in and returns the membership', async () => {
      const phone = randomPhone();
      await enrol(phone);

      await http().post('/api/v1/auth/request-otp').send({ phone }).expect(200);
      const response = await http()
        .post('/api/v1/auth/verify-otp')
        .send({ phone, otp: transport.lastCodeFor(phone) })
        .expect(200);

      expect(response.body.status).toBe('authenticated');
      expect(response.body.membership.studioId).toBe(studioId);
      expect(response.body.membership.studioName).toBe(studioName);
      expect(response.body.tokens.accessToken).toBeTruthy();
    });

    it('rejects the wrong code', async () => {
      const phone = randomPhone();
      await enrol(phone);
      await http().post('/api/v1/auth/request-otp').send({ phone }).expect(200);

      const response = await http().post('/api/v1/auth/verify-otp').send({ phone, otp: '000000' });
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe(ErrorCode.UNAUTHENTICATED);
    });

    /** Single use: an intercepted code must not sign anyone in twice. */
    it('refuses to reuse a code that already worked', async () => {
      const phone = randomPhone();
      await enrol(phone);
      await http().post('/api/v1/auth/request-otp').send({ phone }).expect(200);
      const code = transport.lastCodeFor(phone);

      await http().post('/api/v1/auth/verify-otp').send({ phone, otp: code }).expect(200);
      const replay = await http().post('/api/v1/auth/verify-otp').send({ phone, otp: code });

      expect(replay.status).toBe(401);
    });

    it('burns the code after five wrong attempts, so the space cannot be walked', async () => {
      const phone = randomPhone();
      await enrol(phone);
      await http().post('/api/v1/auth/request-otp').send({ phone }).expect(200);
      const code = transport.lastCodeFor(phone);

      for (let i = 0; i < 5; i += 1) {
        await http().post('/api/v1/auth/verify-otp').send({ phone, otp: '111111' });
      }

      // Even the CORRECT code no longer works — the attempted code was destroyed.
      const withRealCode = await http().post('/api/v1/auth/verify-otp').send({ phone, otp: code });
      expect(withRealCode.status).toBe(401);
    });

    it('refuses a verified user who belongs to no studio', async () => {
      const phone = randomPhone();
      await http().post('/api/v1/auth/request-otp').send({ phone }).expect(200);

      const response = await http()
        .post('/api/v1/auth/verify-otp')
        .send({ phone, otp: transport.lastCodeFor(phone) });

      // 403, not a token with a null studio — which the guard would reject anyway.
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe(ErrorCode.FORBIDDEN);
    });
  });

  describe('authenticated access', () => {
    it('returns the session and the gyms resolved for it', async () => {
      const phone = randomPhone();
      await enrol(phone);
      const { accessToken } = await signIn(phone);

      const response = await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.user.phone).toBe(phone);
      expect(response.body.membership.studioId).toBe(studioId);
      // Resolved once per request by the guard, never derived by a handler.
      expect(response.body.accessibleGymIds.length).toBeGreaterThan(0);
    });

    // Deny by default: JwtAuthGuard is global, so a new route is protected on creation.
    it.each<[string, string]>([
      ['', 'no header'],
      ['Bearer not.a.jwt', 'a malformed token'],
      ['Basic dXNlcjpwYXNz', 'the wrong scheme'],
      ['Bearer ', 'an empty bearer'],
    ])('rejects %j (%s)', async (header) => {
      const call = http().get('/api/v1/auth/me');
      if (header) call.set('Authorization', header);

      const response = await call;
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe(ErrorCode.UNAUTHENTICATED);
    });

    /**
     * The two token types use different secrets, so this cannot verify — but it is asserted
     * because a future refactor sharing one secret would otherwise silently promote every
     * refresh token into an access token.
     */
    it('will not accept a refresh token as an access token', async () => {
      const phone = randomPhone();
      await enrol(phone);
      const { refreshToken } = await signIn(phone);

      const response = await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${refreshToken}`);

      expect(response.status).toBe(401);
    });
  });

  describe('refresh', () => {
    it('rotates to a new pair', async () => {
      const phone = randomPhone();
      await enrol(phone);
      const initial = await signIn(phone);

      const response = await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: initial.refreshToken })
        .expect(200);

      expect(response.body.tokens.refreshToken).not.toBe(initial.refreshToken);
      expect(response.body.tokens.accessToken).not.toBe(initial.accessToken);
    });

    /**
     * THE REFRESH STORM.
     *
     * An app resuming from background fires several requests at once; all get 401, all
     * refresh. With rotation alone the first invalidates the token the others hold, reuse
     * detection fires, and the user is signed out for behaving correctly. The successor
     * grace window is what makes every racer receive the same new pair instead.
     *
     * This is the half of the fix that is usually missing, and it only shows up on real
     * mobile networks.
     */
    it('gives every concurrent refresh the same successor instead of logging the user out', async () => {
      const phone = randomPhone();
      await enrol(phone);
      const { refreshToken } = await signIn(phone);

      const responses = await Promise.all(
        Array.from({ length: 5 }, () => http().post('/api/v1/auth/refresh').send({ refreshToken })),
      );

      expect(responses.every((r) => r.status === 200)).toBe(true);

      const issued = new Set(responses.map((r) => r.body.tokens.refreshToken));
      expect(issued.size).toBe(1);
    });

    it('rejects a token that was never issued', async () => {
      const response = await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'not.a.real.token' });

      expect(response.status).toBe(401);
    });
  });

  describe('logout', () => {
    it('revokes the access token immediately', async () => {
      const phone = randomPhone();
      await enrol(phone);
      const { accessToken, refreshToken } = await signIn(phone);

      await http()
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);

      // Still cryptographically valid and unexpired — the revocation list is what stops it.
      const afterLogout = await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(afterLogout.status).toBe(401);
    });

    it('ends the refresh family, so the session cannot be resumed', async () => {
      const phone = randomPhone();
      await enrol(phone);
      const { accessToken, refreshToken } = await signIn(phone);

      await http()
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);

      const response = await http().post('/api/v1/auth/refresh').send({ refreshToken });
      expect(response.status).toBe(401);
    });
  });

  describe('multi-studio', () => {
    it('offers a choice rather than guessing which studio to sign into', async () => {
      const phone = randomPhone();
      const userId = await enrol(phone);

      // A second studio for the same person — a trainer working at two businesses.
      const secondStudioId = randomUUID();
      await withTenant(secondStudioId, async (tx) => {
        await tx.insert(studios).values({
          id: secondStudioId,
          name: 'Second Studio',
          slug: `s2-${secondStudioId.slice(0, 12)}`,
        });
        await tx.insert(memberships).values({ studioId: secondStudioId, userId, role: 'trainer' });
      });

      await http().post('/api/v1/auth/request-otp').send({ phone }).expect(200);
      const response = await http()
        .post('/api/v1/auth/verify-otp')
        .send({ phone, otp: transport.lastCodeFor(phone) })
        .expect(200);

      // Picking the first would silently sign a trainer into the wrong business.
      expect(response.body.status).toBe('needsStudioSelection');
      expect(response.body.memberships).toHaveLength(2);
      expect(response.body.selectionToken).toBeTruthy();
    });

    it('signs into the named membership and reissues on switch', async () => {
      const phone = randomPhone();
      const userId = await enrol(phone);

      const secondStudioId = randomUUID();
      await withTenant(secondStudioId, async (tx) => {
        await tx.insert(studios).values({
          id: secondStudioId,
          name: 'Switch Target',
          slug: `s3-${secondStudioId.slice(0, 12)}`,
        });
        await tx.insert(memberships).values({ studioId: secondStudioId, userId, role: 'trainer' });
      });

      await http().post('/api/v1/auth/request-otp').send({ phone }).expect(200);
      const listed = await http()
        .post('/api/v1/auth/verify-otp')
        .send({ phone, otp: transport.lastCodeFor(phone) })
        .expect(200);

      const target = listed.body.memberships.find(
        (m: { studioId: string }) => m.studioId === secondStudioId,
      );

      await http().post('/api/v1/auth/request-otp').send({ phone });
      const signedIn = await http()
        .post('/api/v1/auth/verify-otp')
        .send({ phone, otp: transport.lastCodeFor(phone), membershipId: target.membershipId })
        .expect(200);

      expect(signedIn.body.membership.studioId).toBe(secondStudioId);
      expect(signedIn.body.membership.role).toBe('trainer');

      // And switching back reissues for the original studio.
      const switched = await http()
        .post('/api/v1/auth/switch-studio')
        .set('Authorization', `Bearer ${signedIn.body.tokens.accessToken}`)
        .send({
          membershipId: listed.body.memberships.find(
            (m: { studioId: string }) => m.studioId === studioId,
          ).membershipId,
        })
        .expect(200);

      expect(switched.body.membership.studioId).toBe(studioId);
    });

    /** Naming someone else's membership must be a 403, never a silent fallback. */
    it('refuses to switch to a membership the user does not hold', async () => {
      const phone = randomPhone();
      await enrol(phone);
      const { accessToken } = await signIn(phone);

      const response = await http()
        .post('/api/v1/auth/switch-studio')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ membershipId: randomUUID() });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe(ErrorCode.FORBIDDEN);
    });
  });
});
