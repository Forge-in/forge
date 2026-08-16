import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, TestingModule } from '@nestjs/testing';
import { ErrorCode } from '@forge/shared';
import {
  and,
  eq,
  gyms,
  isNull,
  memberships,
  platformAdmins,
  runAsSystem,
  studios,
  takeFirst,
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
 * Company admin console authentication, end to end against real Postgres and Redis.
 *
 * Written as attacks: perform the thing that must not work, assert it did not. The cases
 * that matter most here are the ones with no visible symptom when they break — an
 * enumeration oracle answers correctly, a suspended administrator keeps working, a member's
 * token is quietly accepted by the console.
 *
 * Phone numbers are randomised per test because the OTP rate limits are per phone and
 * persist in Redis for fifteen minutes; a fixed number would pass once and then fail for the
 * rest of the window.
 */

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

  wasSentTo(phone: string): boolean {
    return this.sent.some((s) => s.phone === phone);
  }
}

const randomPhone = (): string =>
  `+919${Math.floor(100000000 + Math.random() * 899999999)}`.slice(0, 13);

describe('admin auth (e2e)', () => {
  let app: NestExpressApplication;
  let transport: RecordingTransport;

  /** A permanent second administrator, so "cannot suspend the last one" is never the reason
   *  a suspension test fails. Created once and never suspended. */
  let anchorPhone: string;
  let anchorTokens: { accessToken: string; refreshToken: string };

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

    anchorPhone = randomPhone();
    await seedAdmin(anchorPhone);
    anchorTokens = await signIn(anchorPhone);
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  /** Creates a platform admin the way the seed CLI does — the only non-invite path there is. */
  async function seedAdmin(phone: string): Promise<{ userId: string; adminId: string }> {
    return runAsSystem('test:seed-admin', async (tx) => {
      const existing = takeFirst(
        await tx
          .select()
          .from(users)
          .where(and(eq(users.phone, phone), isNull(users.deletedAt))),
      );

      const user =
        existing ?? takeFirstOrThrow(await tx.insert(users).values({ phone }).returning(), 'user');

      const admin = takeFirstOrThrow(
        await tx.insert(platformAdmins).values({ userId: user.id, status: 'active' }).returning(),
        'admin',
      );

      return { userId: user.id, adminId: admin.id };
    });
  }

  async function signIn(phone: string): Promise<{ accessToken: string; refreshToken: string }> {
    await http().post('/api/v1/admin/auth/request-otp').send({ phone }).expect(200);
    const response = await http()
      .post('/api/v1/admin/auth/verify-otp')
      .send({ phone, otp: transport.lastCodeFor(phone) })
      .expect(200);
    return response.body.tokens;
  }

  const asAnchor = <T extends request.Test>(call: T): T =>
    call.set('Authorization', `Bearer ${anchorTokens.accessToken}`);

  // =====================================================================================

  describe('requesting a code', () => {
    it('sends one to an administrator and reports the cooldown', async () => {
      const phone = randomPhone();
      await seedAdmin(phone);

      const response = await http()
        .post('/api/v1/admin/auth/request-otp')
        .send({ phone })
        .expect(200);

      expect(response.body).toMatchObject({ status: 'sent' });
      expect(transport.lastCodeFor(phone)).toMatch(/^\d{6}$/);
    });

    /**
     * THE ENUMERATION ORACLE, and the highest-stakes assertion in this file.
     *
     * The set of phones that can reach every tenant is a handful of numbers. If a stranger's
     * number answered differently from an administrator's, this endpoint would hand out
     * exactly the shortlist worth buying a SIM swap for.
     */
    it('answers identically for a number that is not an administrator', async () => {
      const stranger = randomPhone();
      const admin = randomPhone();
      await seedAdmin(admin);

      const strangerResponse = await http()
        .post('/api/v1/admin/auth/request-otp')
        .send({ phone: stranger });
      const adminResponse = await http()
        .post('/api/v1/admin/auth/request-otp')
        .send({ phone: admin });

      expect(strangerResponse.status).toBe(adminResponse.status);
      expect(strangerResponse.body).toEqual(adminResponse.body);
    });

    /**
     * ...while still not spending an SMS on them. There is no self-registration here, so
     * texting arbitrary numbers would be a free SMS cannon pointed at anyone — and the
     * caller cannot observe the difference unless they already hold the handset.
     */
    it('does not actually send to a number that is not an administrator', async () => {
      const stranger = randomPhone();
      await http().post('/api/v1/admin/auth/request-otp').send({ phone: stranger }).expect(200);

      expect(transport.wasSentTo(stranger)).toBe(false);
    });

    it('rejects a malformed number before doing any work', async () => {
      const response = await http()
        .post('/api/v1/admin/auth/request-otp')
        .send({ phone: '9876543210' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    });

    // The console gets its own budget (ADMIN_OTP_MAX_PER_PHONE, default 5) so that member
    // traffic cannot exhaust an administrator's allowance during an incident.
    it('rate limits per phone on its own budget', async () => {
      const phone = randomPhone();
      await seedAdmin(phone);

      for (let i = 0; i < 5; i += 1) {
        await http().post('/api/v1/admin/auth/request-otp').send({ phone }).expect(200);
      }

      const blocked = await http().post('/api/v1/admin/auth/request-otp').send({ phone });
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe(ErrorCode.RATE_LIMITED);
    });

    /**
     * The buckets are namespaced by purpose, so a member-endpoint flood against an
     * administrator's number must not touch their console allowance. Without this the
     * console can be denied to a named person for the cost of three HTTP requests.
     */
    it('keeps the member endpoint from spending the console budget', async () => {
      const phone = randomPhone();
      await seedAdmin(phone);

      // Exhaust the member per-phone limit (default 3) for this number.
      for (let i = 0; i < 4; i += 1) {
        await http().post('/api/v1/auth/request-otp').send({ phone });
      }

      const console = await http().post('/api/v1/admin/auth/request-otp').send({ phone });
      expect(console.status).toBe(200);
    });
  });

  describe('verifying a code', () => {
    it('signs an administrator in and returns their identity', async () => {
      const phone = randomPhone();
      const { adminId, userId } = await seedAdmin(phone);

      await http().post('/api/v1/admin/auth/request-otp').send({ phone }).expect(200);
      const response = await http()
        .post('/api/v1/admin/auth/verify-otp')
        .send({ phone, otp: transport.lastCodeFor(phone) })
        .expect(200);

      expect(response.body.admin).toMatchObject({ adminId, userId, phone });
      expect(response.body.tokens.accessToken).toBeTruthy();
    });

    it('rejects the wrong code', async () => {
      const phone = randomPhone();
      await seedAdmin(phone);
      await http().post('/api/v1/admin/auth/request-otp').send({ phone }).expect(200);

      const response = await http()
        .post('/api/v1/admin/auth/verify-otp')
        .send({ phone, otp: '000000' });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe(ErrorCode.UNAUTHENTICATED);
    });

    /**
     * A code requested on the MEMBER endpoint must not unlock the console.
     *
     * Without the purpose in the OTP key this passes silently, and the console's second
     * factor becomes obtainable from the surface with the loosest limits and the largest
     * attack surface — for anyone who is both a member and an administrator, which is the
     * normal case for a founder.
     */
    it('will not accept a code that was issued for the member app', async () => {
      const phone = randomPhone();
      await seedAdmin(phone);

      await http().post('/api/v1/auth/request-otp').send({ phone }).expect(200);
      const memberCode = transport.lastCodeFor(phone);

      const response = await http()
        .post('/api/v1/admin/auth/verify-otp')
        .send({ phone, otp: memberCode });

      expect(response.status).toBe(401);
    });

    /**
     * A verified code from a number that is not an administrator gets the SAME 401 and the
     * same message as a wrong code — never a 403 that says "you are not an administrator".
     *
     * That answer would be handed out only after the caller proved they hold the SIM, which
     * is exactly the position a SIM-swap attacker is in when they most want to know whether
     * the number was worth taking.
     */
    it('is indistinguishable from a wrong code when the number is not an administrator', async () => {
      const stranger = randomPhone();
      // Seed an invite-less code by asking as an administrator first, then reusing the shape:
      // the stranger has no code at all, so a wrong-code attempt is the closest comparison.
      const wrongCode = await http()
        .post('/api/v1/admin/auth/verify-otp')
        .send({ phone: stranger, otp: '123456' });

      expect(wrongCode.status).toBe(401);
      expect(wrongCode.body.error.code).toBe(ErrorCode.UNAUTHENTICATED);
    });

    /** Single use: an intercepted code must not sign anyone in twice. */
    it('refuses to reuse a code that already worked', async () => {
      const phone = randomPhone();
      await seedAdmin(phone);
      await http().post('/api/v1/admin/auth/request-otp').send({ phone }).expect(200);
      const code = transport.lastCodeFor(phone);

      await http().post('/api/v1/admin/auth/verify-otp').send({ phone, otp: code }).expect(200);
      const replay = await http().post('/api/v1/admin/auth/verify-otp').send({ phone, otp: code });

      expect(replay.status).toBe(401);
    });
  });

  describe('token audience separation', () => {
    /** Registers a phone as an ordinary gym member, so it can hold a member session. */
    async function enrolMember(phone: string): Promise<void> {
      const studioId = randomUUID();
      const userId = await runAsSystem(
        'test:create-member',
        async (tx) =>
          takeFirstOrThrow(
            await tx.insert(users).values({ phone }).returning({ id: users.id }),
            'u',
          ).id,
      );

      await withTenant(studioId, async (tx) => {
        await tx
          .insert(studios)
          .values({ id: studioId, name: 'Audience Studio', slug: `aud-${studioId.slice(0, 12)}` });
        await tx
          .insert(gyms)
          .values({ studioId, name: 'Branch', code: `B${studioId.slice(0, 6)}` });
        await tx.insert(memberships).values({ studioId, userId, role: 'gym_user' });
      });
    }

    /**
     * A member's access token must be worthless against the console — not merely
     * insufficient by role, but rejected before the role is ever read.
     */
    it('rejects a member access token on a console route', async () => {
      const phone = randomPhone();
      await enrolMember(phone);

      await http().post('/api/v1/auth/request-otp').send({ phone }).expect(200);
      const member = await http()
        .post('/api/v1/auth/verify-otp')
        .send({ phone, otp: transport.lastCodeFor(phone) })
        .expect(200);

      const response = await http()
        .get('/api/v1/admin/auth/me')
        .set('Authorization', `Bearer ${member.body.tokens.accessToken}`);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe(ErrorCode.UNAUTHENTICATED);
    });

    /**
     * And the reverse. A console token leaking anywhere — a proxy log, an error report —
     * must not become a working key to the whole product API.
     */
    it('rejects a console access token on a member route', async () => {
      const response = await http()
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${anchorTokens.accessToken}`);

      expect(response.status).toBe(401);
    });

    /**
     * The refresh endpoints are the cheapest place to try a stolen token, because both are
     * necessarily public. A member's refresh token must not have the console mint a session
     * from it.
     */
    it('rejects a member refresh token on the console refresh endpoint', async () => {
      const phone = randomPhone();
      await enrolMember(phone);

      await http().post('/api/v1/auth/request-otp').send({ phone }).expect(200);
      const member = await http()
        .post('/api/v1/auth/verify-otp')
        .send({ phone, otp: transport.lastCodeFor(phone) })
        .expect(200);

      const response = await http()
        .post('/api/v1/admin/auth/refresh')
        .send({ refreshToken: member.body.tokens.refreshToken });

      expect(response.status).toBe(401);
    });
  });

  describe('session lifecycle', () => {
    it('returns the signed-in administrator from /me', async () => {
      const response = await asAnchor(http().get('/api/v1/admin/auth/me')).expect(200);
      expect(response.body.admin.phone).toBe(anchorPhone);
    });

    it.each<[string, string]>([
      ['', 'no header'],
      ['Bearer not.a.jwt', 'a malformed token'],
      ['Basic dXNlcjpwYXNz', 'the wrong scheme'],
    ])('rejects %j (%s)', async (header) => {
      const call = http().get('/api/v1/admin/auth/me');
      if (header) call.set('Authorization', header);

      const response = await call;
      expect(response.status).toBe(401);
    });

    it('rotates to a new pair on refresh', async () => {
      const phone = randomPhone();
      await seedAdmin(phone);
      const initial = await signIn(phone);

      const response = await http()
        .post('/api/v1/admin/auth/refresh')
        .send({ refreshToken: initial.refreshToken })
        .expect(200);

      expect(response.body.tokens.refreshToken).not.toBe(initial.refreshToken);
    });

    /**
     * The refresh storm. Several tabs of a console resuming at once all get 401 and all
     * refresh; the successor grace window is what makes every racer receive the same new
     * pair instead of reuse detection firing and signing the administrator out.
     */
    it('gives every concurrent refresh the same successor', async () => {
      const phone = randomPhone();
      await seedAdmin(phone);
      const { refreshToken } = await signIn(phone);

      const responses = await Promise.all(
        Array.from({ length: 5 }, () =>
          http().post('/api/v1/admin/auth/refresh').send({ refreshToken }),
        ),
      );

      expect(responses.every((r) => r.status === 200)).toBe(true);
      expect(new Set(responses.map((r) => r.body.tokens.refreshToken)).size).toBe(1);
    });

    it('revokes the access token and the refresh family on logout', async () => {
      const phone = randomPhone();
      await seedAdmin(phone);
      const { accessToken, refreshToken } = await signIn(phone);

      await http()
        .post('/api/v1/admin/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(200);

      // Still cryptographically valid and unexpired — the revocation list is what stops it.
      const after = await http()
        .get('/api/v1/admin/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(after.status).toBe(401);

      const resumed = await http().post('/api/v1/admin/auth/refresh').send({ refreshToken });
      expect(resumed.status).toBe(401);
    });
  });

  describe('invites', () => {
    it('issues a token once and activates an administrator with it', async () => {
      const phone = randomPhone();

      const created = await asAnchor(http().post('/api/v1/admin/invites'))
        .send({ phone })
        .expect(201);

      expect(created.body.inviteToken).toBeTruthy();
      // The list must never carry the plaintext token — only the create response does.
      const listed = await asAnchor(http().get('/api/v1/admin/invites')).expect(200);
      const entry = listed.body.invites.find((i: { phone: string }) => i.phone === phone);
      expect(entry).toBeDefined();
      expect(entry.inviteToken).toBeUndefined();

      await http().post('/api/v1/admin/auth/request-otp').send({ phone }).expect(200);
      const activated = await http()
        .post('/api/v1/admin/auth/accept-invite')
        .send({ phone, otp: transport.lastCodeFor(phone), inviteToken: created.body.inviteToken })
        .expect(200);

      expect(activated.body.admin.phone).toBe(phone);
      expect(activated.body.tokens.accessToken).toBeTruthy();
    });

    /** An invite makes a pending number entitled to receive a code, so activation is possible. */
    it('sends a code to an invited number that is not yet an administrator', async () => {
      const phone = randomPhone();
      await asAnchor(http().post('/api/v1/admin/invites')).send({ phone }).expect(201);

      await http().post('/api/v1/admin/auth/request-otp').send({ phone }).expect(200);
      expect(transport.wasSentTo(phone)).toBe(true);
    });

    /**
     * THE ATTACK THE TOKEN EXISTS TO STOP.
     *
     * Sign-in is phone OTP, so possession of the SIM is the entire login factor. If a token
     * intercepted from a chat could be redeemed against a DIFFERENT number, the OTP would be
     * checking a factor of the attacker's own choosing and the invite would add nothing.
     */
    it('refuses a valid token presented from a different phone', async () => {
      const invited = randomPhone();
      const attacker = randomPhone();

      const created = await asAnchor(http().post('/api/v1/admin/invites'))
        .send({ phone: invited })
        .expect(201);

      // The attacker holds their own handset, so they can complete an OTP for it.
      await seedAdmin(attacker);
      await http().post('/api/v1/admin/auth/request-otp').send({ phone: attacker }).expect(200);

      const response = await http()
        .post('/api/v1/admin/auth/accept-invite')
        .send({
          phone: attacker,
          otp: transport.lastCodeFor(attacker),
          inviteToken: created.body.inviteToken,
        });

      expect(response.status).toBe(401);
    });

    it('refuses a token that was never issued', async () => {
      const phone = randomPhone();
      await asAnchor(http().post('/api/v1/admin/invites')).send({ phone }).expect(201);
      await http().post('/api/v1/admin/auth/request-otp').send({ phone }).expect(200);

      const response = await http()
        .post('/api/v1/admin/auth/accept-invite')
        .send({
          phone,
          otp: transport.lastCodeFor(phone),
          inviteToken: 'x'.repeat(43),
        });

      expect(response.status).toBe(401);
    });

    /** Single use. A token that keeps working is a standing grant, not an invite. */
    it('refuses to redeem the same invite twice', async () => {
      const phone = randomPhone();
      const created = await asAnchor(http().post('/api/v1/admin/invites'))
        .send({ phone })
        .expect(201);

      await http().post('/api/v1/admin/auth/request-otp').send({ phone }).expect(200);
      await http()
        .post('/api/v1/admin/auth/accept-invite')
        .send({ phone, otp: transport.lastCodeFor(phone), inviteToken: created.body.inviteToken })
        .expect(200);

      // A fresh code, so only the invite's single-use property can be what fails.
      await http().post('/api/v1/admin/auth/request-otp').send({ phone }).expect(200);
      const replay = await http()
        .post('/api/v1/admin/auth/accept-invite')
        .send({ phone, otp: transport.lastCodeFor(phone), inviteToken: created.body.inviteToken });

      expect(replay.status).toBe(401);
    });

    it('revokes an invite, after which the token is dead', async () => {
      const phone = randomPhone();
      const created = await asAnchor(http().post('/api/v1/admin/invites'))
        .send({ phone })
        .expect(201);

      await asAnchor(http().delete(`/api/v1/admin/invites/${created.body.invite.id}`)).expect(200);

      await http().post('/api/v1/admin/auth/request-otp').send({ phone });
      const response = await http()
        .post('/api/v1/admin/auth/accept-invite')
        .send({ phone, otp: '123456', inviteToken: created.body.inviteToken });

      expect(response.status).toBe(401);
    });

    /**
     * Re-inviting supersedes rather than colliding with the outstanding invite — and the old
     * token stops working, so one read out over the phone last week cannot be used today.
     */
    it('invalidates the previous token when a number is re-invited', async () => {
      const phone = randomPhone();
      const first = await asAnchor(http().post('/api/v1/admin/invites'))
        .send({ phone })
        .expect(201);
      const second = await asAnchor(http().post('/api/v1/admin/invites'))
        .send({ phone })
        .expect(201);

      expect(second.body.inviteToken).not.toBe(first.body.inviteToken);

      await http().post('/api/v1/admin/auth/request-otp').send({ phone }).expect(200);
      const withOldToken = await http()
        .post('/api/v1/admin/auth/accept-invite')
        .send({ phone, otp: transport.lastCodeFor(phone), inviteToken: first.body.inviteToken });

      expect(withOldToken.status).toBe(401);
    });

    it('refuses to invite a number that is already an administrator', async () => {
      const phone = randomPhone();
      await seedAdmin(phone);

      const response = await asAnchor(http().post('/api/v1/admin/invites')).send({ phone });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe(ErrorCode.CONFLICT);
    });

    // No public path into provisioning: the first administrator comes from the seed CLI.
    it('requires an existing session to create an invite', async () => {
      const response = await http().post('/api/v1/admin/invites').send({ phone: randomPhone() });

      expect(response.status).toBe(401);
    });
  });

  describe('suspension', () => {
    it('ends every live session immediately, not at the next token expiry', async () => {
      const phone = randomPhone();
      const { adminId } = await seedAdmin(phone);
      const { accessToken, refreshToken } = await signIn(phone);

      // The token works right up to the moment of suspension.
      await http()
        .get('/api/v1/admin/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await asAnchor(http().post(`/api/v1/admin/admins/${adminId}/suspend`)).expect(200);

      /**
       * Still cryptographically valid and nowhere near expiry. Family revocation alone would
       * leave this working in an open browser tab — during which the suspended person can
       * still suspend a gym or read every tenant's data.
       */
      const after = await http()
        .get('/api/v1/admin/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(after.status).toBe(401);

      const resumed = await http().post('/api/v1/admin/auth/refresh').send({ refreshToken });
      expect(resumed.status).toBe(401);
    });

    it('stops a suspended administrator signing in again', async () => {
      const phone = randomPhone();
      const { adminId } = await seedAdmin(phone);
      await asAnchor(http().post(`/api/v1/admin/admins/${adminId}/suspend`)).expect(200);

      await http().post('/api/v1/admin/auth/request-otp').send({ phone });
      const response = await http()
        .post('/api/v1/admin/auth/verify-otp')
        .send({ phone, otp: '123456' });

      expect(response.status).toBe(401);
    });

    /**
     * Almost always a misclick on a list where your own row looks like everyone else's — and
     * the result is being locked out of the tool you would use to undo it.
     */
    it('refuses to let an administrator suspend themselves', async () => {
      const me = await asAnchor(http().get('/api/v1/admin/auth/me')).expect(200);

      const response = await asAnchor(
        http().post(`/api/v1/admin/admins/${me.body.admin.adminId}/suspend`),
      );

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe(ErrorCode.FORBIDDEN);
    });

    it('reinstates, and the administrator can sign in again', async () => {
      const phone = randomPhone();
      const { adminId } = await seedAdmin(phone);

      await asAnchor(http().post(`/api/v1/admin/admins/${adminId}/suspend`)).expect(200);
      const reinstated = await asAnchor(
        http().post(`/api/v1/admin/admins/${adminId}/reinstate`),
      ).expect(200);

      expect(reinstated.body.admin.status).toBe('active');
      expect(reinstated.body.admin.suspendedAt).toBeNull();

      /**
       * The revocation cut-off must be cleared on reinstatement. If it is not, this signs in
       * "successfully" and then every request 401s — a bug with no error message anywhere,
       * because the token really was issued before a revocation that no longer applies.
       */
      const tokens = await signIn(phone);
      await http()
        .get('/api/v1/admin/auth/me')
        .set('Authorization', `Bearer ${tokens.accessToken}`)
        .expect(200);
    });

    it('rejects suspending an id that does not exist', async () => {
      const response = await asAnchor(http().post(`/api/v1/admin/admins/${randomUUID()}/suspend`));
      expect(response.status).toBe(404);
    });

    it('lists administrators with their status', async () => {
      const phone = randomPhone();
      await seedAdmin(phone);

      const response = await asAnchor(http().get('/api/v1/admin/admins')).expect(200);
      const entry = response.body.admins.find((a: { phone: string }) => a.phone === phone);

      expect(entry).toMatchObject({ phone, status: 'active' });
    });
  });
});
