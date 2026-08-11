import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode, Role, v1 } from '@forge/shared';
import {
  memberships,
  runAsSystem,
  studios,
  takeFirst,
  users,
  withTenantRead,
  withUser,
} from '@forge/db';
import { and, eq, isNull } from 'drizzle-orm';

import type { Env } from '../../config/env.schema';
import { OtpService } from './otp.service';
import type { OtpTransport } from './otp-transport';
import { TokenService, type SessionClaims } from './token.service';

/**
 * Sign-in orchestration.
 *
 * The invariant running through all of it: nothing about whether a phone number is
 * registered ever reaches the caller. Requesting a code for an unknown number behaves
 * exactly like requesting one for a member — same response, same timing budget, same rate
 * limits. Otherwise this endpoint becomes a membership oracle for any gym on the platform.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly otp: OtpService,
    private readonly transport: OtpTransport,
    private readonly tokens: TokenService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Sends a code. Says nothing about whether the number is known. */
  async requestOtp(phone: string, ip: string, requestId: string): Promise<v1.RequestOtpResponse> {
    // The reviewer account short-circuits delivery entirely — see verifyOtp.
    if (this.isDemoPhone(phone)) {
      return { status: 'sent', retryAfterSeconds: 60, expiresInSeconds: 300 };
    }

    const issued = await this.otp.issue(phone, ip, requestId);

    if (issued.isNewCode) {
      try {
        await this.transport.send(phone, issued.code);
      } catch (error) {
        // The code is already stored, so a transport failure must not look like success —
        // the user would sit waiting for an SMS that is never coming.
        this.logger.error({
          event: 'auth.otp_send_failed',
          transport: this.transport.name,
          message: error instanceof Error ? error.message : 'unknown',
        });
        throw new HttpException(
          {
            code: ErrorCode.SERVICE_UNAVAILABLE,
            message: 'Could not send the verification code. Please try again.',
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
    }

    return {
      status: 'sent',
      retryAfterSeconds: issued.retryAfterSeconds,
      expiresInSeconds: issued.expiresInSeconds,
    };
  }

  /**
   * Verifies a code and signs the user in.
   *
   * A user with no membership anywhere is authenticated but has nothing to be scoped to.
   * That is a real state — someone whose gym removed them — and it returns 403 rather than
   * a token with a null studio, which the guard would (correctly) reject anyway.
   */
  async verifyOtp(body: v1.VerifyOtpBody): Promise<v1.VerifyOtpResponse> {
    const verified = this.isDemoPhone(body.phone)
      ? body.otp === this.config.get('DEMO_OTP', { infer: true })
      : await this.otp.verify(body.phone, body.otp);

    if (!verified) {
      throw new HttpException(
        { code: ErrorCode.UNAUTHENTICATED, message: 'That code is not valid.' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const user = await this.findOrCreateUser(body.phone);
    const available = await this.listMemberships(user.id);

    if (available.length === 0) {
      throw new HttpException(
        {
          code: ErrorCode.FORBIDDEN,
          message: 'This number is not linked to any gym yet. Ask your gym to add you.',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // More than one membership and no explicit choice: return the options rather than
    // guessing. Picking the first would silently sign a trainer into the wrong studio.
    if (available.length > 1 && !body.membershipId) {
      return {
        status: 'needsStudioSelection',
        // Short-lived proof the OTP was verified, so the code is not re-entered.
        selectionToken: (
          await this.tokens.issue({
            userId: user.id,
            studioId: null,
            role: Role.GYM_USER,
            membershipId: null,
          })
        ).accessToken,
        // No cast needed: zod's .min(2) is a runtime constraint, not a tuple type, and
        // this branch is already guarded by available.length > 1.
        memberships: available,
      };
    }

    const chosen = body.membershipId
      ? available.find((m) => m.membershipId === body.membershipId)
      : available[0];

    // Naming a membership the user does not hold is a 403, never a silent fallback to a
    // different one — a fallback would sign them into a studio they did not ask for.
    if (!chosen) {
      throw new HttpException(
        { code: ErrorCode.FORBIDDEN, message: 'That membership is not available.' },
        HttpStatus.FORBIDDEN,
      );
    }

    await this.otp.clear(body.phone);

    const tokens = await this.tokens.issue({
      userId: user.id,
      studioId: chosen.studioId,
      role: chosen.role,
      membershipId: chosen.membershipId,
    });

    return {
      status: 'authenticated',
      tokens,
      membership: chosen,
      user: { id: user.id, phone: user.phone, fullName: user.fullName },
    };
  }

  /**
   * Rotates the refresh token, re-reading the membership from the database.
   *
   * Re-reading is the point: a demotion or a removed membership takes effect within one
   * access-token lifetime instead of persisting for the full 30-day refresh window. An
   * offboarded trainer must not keep working simply because their session is old.
   */
  async refresh(refreshToken: string): Promise<v1.RefreshResponse> {
    const tokens = await this.tokens.rotate(refreshToken, async (payload) => {
      if (!payload.membershipId || !payload.studioId) {
        // A selection token (no membership) is not a session and cannot be refreshed.
        throw new HttpException(
          { code: ErrorCode.UNAUTHENTICATED, message: 'Please sign in again.' },
          HttpStatus.UNAUTHORIZED,
        );
      }

      const membership = await this.findMembership(payload.studioId, payload.membershipId);

      if (!membership) {
        throw new HttpException(
          { code: ErrorCode.UNAUTHENTICATED, message: 'Your access has changed. Sign in again.' },
          HttpStatus.UNAUTHORIZED,
        );
      }

      const claims: SessionClaims = {
        userId: payload.sub,
        studioId: membership.studioId,
        role: membership.role,
        membershipId: membership.membershipId,
      };
      return claims;
    });

    return { tokens };
  }

  /** Reissues for a different studio. The real "switch" — membership is studio-level. */
  async switchStudio(userId: string, membershipId: string): Promise<v1.SwitchStudioResponse> {
    const available = await this.listMemberships(userId);
    const target = available.find((m) => m.membershipId === membershipId);

    if (!target) {
      throw new HttpException(
        { code: ErrorCode.FORBIDDEN, message: 'That membership is not available.' },
        HttpStatus.FORBIDDEN,
      );
    }

    const tokens = await this.tokens.issue({
      userId,
      studioId: target.studioId,
      role: target.role,
      membershipId: target.membershipId,
    });

    return { tokens, membership: target };
  }

  async me(
    userId: string,
    studioId: string,
    membershipId: string,
    accessibleGymIds: string[],
  ): Promise<v1.MeResponse> {
    const [user, all, current] = await Promise.all([
      this.findUser(userId),
      this.listMemberships(userId),
      this.findMembership(studioId, membershipId),
    ]);

    if (!user || !current) {
      throw new HttpException(
        { code: ErrorCode.UNAUTHENTICATED, message: 'Your access has changed. Sign in again.' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    return {
      user: { id: user.id, phone: user.phone, fullName: user.fullName },
      membership: current,
      accessibleGymIds,
      memberships: all,
    };
  }

  /** Ends the session. With a refresh token, the whole family dies. */
  async logout(accessJti: string, refreshToken?: string): Promise<v1.LogoutResponse> {
    const accessTtl = this.config.get('JWT_ACCESS_TTL', { infer: true });
    await this.tokens.revoke(accessJti, accessTtl);

    if (refreshToken) {
      // Decoded, not verified: an already-expired refresh token should still end its family,
      // and refusing to act on it would leave a stolen copy usable if it were merely stale.
      const payload = this.tokens.decodeRefresh(refreshToken);
      if (payload?.fam) await this.tokens.revokeFamily(payload.fam);
    }

    return { status: 'signed_out' };
  }

  // -------------------------------------------------------------------------------------

  private isDemoPhone(phone: string): boolean {
    const demo = this.config.get('DEMO_PHONE', { infer: true });
    return Boolean(demo) && phone === demo;
  }

  /**
   * Users are global, so this runs with NO tenant pinned — the one legitimate case, and the
   * reason runAsSystem logs every call with a reason.
   */
  private async findUser(userId: string) {
    return runAsSystem('auth:find-user', async (tx) =>
      takeFirst(await tx.select().from(users).where(eq(users.id, userId))),
    );
  }

  private async findOrCreateUser(phone: string) {
    return runAsSystem('auth:find-or-create-user', async (tx) => {
      const existing = takeFirst(await tx.select().from(users).where(eq(users.phone, phone)));
      if (existing) return existing;

      /**
       * onConflictDoUpdate rather than doNothing: two concurrent verifications of the same
       * code race here, and doNothing returns an empty array for the loser, which would
       * surface as "could not create user" on a perfectly valid sign-in.
       */
      const inserted = await tx
        .insert(users)
        .values({ phone })
        .onConflictDoUpdate({
          target: users.phone,
          /**
           * The unique index on phone is PARTIAL (`WHERE deleted_at IS NULL`), and Postgres
           * requires a conflict target to match the index exactly — predicate included.
           * Without this the statement fails outright with "no unique or exclusion
           * constraint matching the ON CONFLICT specification", which surfaces as a 500 on
           * the very first sign-in of any new user.
           */
          targetWhere: isNull(users.deletedAt),
          set: { updatedAt: new Date() },
        })
        .returning();

      const user = takeFirst(inserted);
      if (user) return user;

      // Partial unique index means the conflict target can miss a soft-deleted row; fall
      // back to a read rather than failing the sign-in.
      const refetched = takeFirst(await tx.select().from(users).where(eq(users.phone, phone)));
      if (!refetched) throw new Error('Could not resolve user after insert');
      return refetched;
    });
  }

  /**
   * Every membership this person holds, across studios.
   *
   * Runs unpinned because it spans tenants by definition — that is what makes a studio
   * switcher possible. It reads only ids, names and roles: no studio's operational data
   * crosses a boundary here.
   */
  private async listMemberships(userId: string): Promise<v1.MembershipSummary[]> {
    // withUser, not runAsSystem: memberships is tenant-scoped, so an unpinned read denies
    // everything. This is the one narrow cross-studio read sign-in needs — see migration 0003.
    return withUser(userId, async (tx) => {
      const rows = await tx
        .select({
          membershipId: memberships.id,
          studioId: memberships.studioId,
          studioName: studios.name,
          role: memberships.role,
        })
        .from(memberships)
        .innerJoin(studios, eq(studios.id, memberships.studioId))
        .where(
          and(
            eq(memberships.userId, userId),
            eq(memberships.status, 'active'),
            isNull(memberships.deletedAt),
            isNull(studios.deletedAt),
          ),
        );

      return rows.map((row) => ({ ...row, role: row.role as Role }));
    });
  }

  /** Re-reads one membership INSIDE its studio's RLS context. */
  private async findMembership(
    studioId: string,
    membershipId: string,
  ): Promise<v1.MembershipSummary | undefined> {
    return withTenantRead(studioId, async (tx) => {
      const row = takeFirst(
        await tx
          .select({
            membershipId: memberships.id,
            studioId: memberships.studioId,
            studioName: studios.name,
            role: memberships.role,
          })
          .from(memberships)
          .innerJoin(studios, eq(studios.id, memberships.studioId))
          .where(
            and(
              eq(memberships.id, membershipId),
              eq(memberships.status, 'active'),
              isNull(memberships.deletedAt),
            ),
          ),
      );

      return row ? { ...row, role: row.role as Role } : undefined;
    });
  }
}
