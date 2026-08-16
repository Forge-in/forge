import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode, Role, TokenAudience, v1 } from '@forge/shared';
import {
  and,
  eq,
  gt,
  isNull,
  platformAdmins,
  platformAdminInvites,
  runAsSystem,
  takeFirst,
  takeFirstOrThrow,
  users,
  type TenantTransaction,
} from '@forge/db';

import type { Env } from '../../config/env.schema';
import { OtpPurpose, OtpService, type OtpLimits } from '../auth/otp.service';
import type { OtpTransport } from '../auth/otp-transport';
import { TokenService, type SessionClaims } from '../auth/token.service';

/**
 * Sign-in and provisioning for the company admin console.
 *
 * SEPARATE FROM AuthService, NOT A BRANCH INSIDE IT.
 *
 * The member flow finds-or-creates a user and signs them into a studio. This flow must do
 * neither: a phone that is not already an administrator gets nothing, and the resulting
 * session is scoped to no studio at all. Those are opposite behaviours on the two most
 * dangerous decisions in the codebase — "should this person exist?" and "what can they
 * see?" — so they live in separate services reached by separate routes. One handler holding
 * both apart with an `if` is one refactor away from signing a stranger into the platform.
 *
 * THE INVARIANT THROUGHOUT: this endpoint never reveals whether a number is an
 * administrator. The member endpoint keeps that promise about gym membership; here the
 * secret is a much shorter list — the handful of phones that can reach every tenant — and
 * therefore a much better target.
 */
@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly otp: OtpService,
    private readonly transport: OtpTransport,
    private readonly tokens: TokenService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // =====================================================================================
  // Sign-in
  // =====================================================================================

  /**
   * Sends a code to a number that is already entitled to the console.
   *
   * WHY DELIVERY IS CONDITIONAL BUT THE RESPONSE IS NOT.
   *
   * Unlike the member endpoint — where anyone may sign up, so every number gets an SMS —
   * there is no self-registration here. Sending to arbitrary numbers would spend real money
   * texting strangers and turn this route into a free SMS cannon pointed at anyone.
   *
   * Skipping delivery is safe from an enumeration standpoint precisely because the caller
   * cannot observe it: the HTTP response is byte-identical either way, and the only way to
   * learn whether a code arrived is to be holding that handset. The rate-limit counters are
   * bumped for every request regardless, so the endpoint is not a free probe either.
   */
  async requestOtp(
    phone: string,
    ip: string,
    requestId: string,
  ): Promise<v1.AdminRequestOtpResponse> {
    const issued = await this.otp.issue(OtpPurpose.CONSOLE, phone, ip, requestId, this.otpLimits());

    const entitled = await this.isEntitledToReceiveCode(phone);

    if (issued.isNewCode && entitled) {
      try {
        await this.transport.send(phone, issued.code);
      } catch (error) {
        // The code is stored, so a transport failure must not read as success — an
        // administrator locked out during an incident needs to know the SMS is not coming.
        this.logger.error({
          event: 'admin_auth.otp_send_failed',
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

    if (!entitled) {
      // The one place this attempt is visible. Hashed, because a plaintext number in the log
      // aggregator is the PII leak the rest of this file is careful to avoid — and a list of
      // numbers that tried to reach the console is itself worth protecting.
      this.logger.warn({
        event: 'admin_auth.otp_requested_for_non_admin',
        phoneHash: hashPhone(phone),
      });
    }

    return {
      status: 'sent',
      retryAfterSeconds: issued.retryAfterSeconds,
      expiresInSeconds: issued.expiresInSeconds,
    };
  }

  /** Verifies a code and issues a console session. */
  async verifyOtp(body: v1.AdminVerifyOtpBody): Promise<v1.AdminSessionResponse> {
    const verified = await this.otp.verify(OtpPurpose.CONSOLE, body.phone, body.otp);

    if (!verified) {
      throw this.unauthenticated('That code is not valid.');
    }

    /**
     * The code is consumed at this point whatever happens next, so it is deliberately NOT
     * re-issued on the failures below. Otherwise a wrong-number attempt would leave a live
     * code sitting against a phone that has no business holding one.
     */
    const admin = await this.findActiveAdminByPhone(body.phone);

    if (!admin) {
      /**
       * 401 with the SAME message as a wrong code, not 403 "you are not an administrator".
       *
       * A distinguishable answer here is the enumeration oracle the whole flow exists to
       * avoid, and it would be handed out only after the caller proved they hold the SIM —
       * which is exactly the position a SIM-swap attacker is in when they most want to know
       * whether the number was worth taking.
       */
      this.logger.warn({
        event: 'admin_auth.verified_code_for_non_admin',
        phoneHash: hashPhone(body.phone),
      });
      throw this.unauthenticated('That code is not valid.');
    }

    await this.otp.clear(OtpPurpose.CONSOLE, body.phone);

    return this.startSession(admin, 'sign_in');
  }

  /**
   * Activates an invited administrator: invite token AND one-time code, in one request.
   *
   * Both factors are checked before anything is written, and the whole thing runs in one
   * transaction, so a failure at any point leaves no half-created administrator behind.
   */
  async acceptInvite(body: v1.AdminAcceptInviteBody): Promise<v1.AdminSessionResponse> {
    const verified = await this.otp.verify(OtpPurpose.CONSOLE, body.phone, body.otp);
    if (!verified) {
      throw this.unauthenticated('That code is not valid.');
    }

    const tokenHash = hashInviteToken(body.inviteToken);

    const admin = await runAsSystem('admin-auth:accept-invite', async (tx) => {
      /**
       * Locked FOR UPDATE, and the predicate re-checked inside the transaction.
       *
       * Two people racing the same invite — or one person double-submitting on a slow
       * network — would otherwise both pass the "is it still pending?" read and both insert,
       * with only the unique index on user_id deciding the winner. That produces a confusing
       * 500 on a legitimate action, and leaves the invite marked accepted by whichever
       * update landed last.
       */
      const invite = takeFirst(
        await tx
          .select()
          .from(platformAdminInvites)
          .where(
            and(
              eq(platformAdminInvites.tokenHash, tokenHash),
              isNull(platformAdminInvites.acceptedAt),
              isNull(platformAdminInvites.revokedAt),
              isNull(platformAdminInvites.deletedAt),
              gt(platformAdminInvites.expiresAt, new Date()),
            ),
          )
          .for('update'),
      );

      /**
       * The invite must be bound to the number that just proved possession. Without this
       * comparison, an intercepted token would let ANY phone the attacker controls become
       * an administrator, and the OTP would be checking a factor of their own choosing.
       *
       * Compared in constant time: the token hash lookup above already tells an attacker
       * whether the token exists, but the phone comparison must not leak a prefix.
       */
      if (!invite || !constantTimeEquals(invite.phone, body.phone)) {
        this.logger.warn({
          event: 'admin_auth.invite_rejected',
          reason: invite ? 'phone_mismatch' : 'not_found_or_spent',
          phoneHash: hashPhone(body.phone),
        });
        return undefined;
      }

      const user = await this.findOrCreateUser(tx, body.phone);

      /**
       * Already an administrator — a re-invite that raced a manual seed, or a suspended
       * account being handed a fresh invite. Consume the invite and reuse the row rather
       * than inserting a duplicate that the unique index would reject anyway.
       *
       * A SUSPENDED admin is deliberately NOT reactivated here. Suspension is a decision
       * someone made; letting an invite quietly undo it would mean anyone who can create an
       * invite can also reverse a revocation without it appearing as a reinstatement.
       */
      const existing = takeFirst(
        await tx
          .select()
          .from(platformAdmins)
          .where(and(eq(platformAdmins.userId, user.id), isNull(platformAdmins.deletedAt))),
      );

      await tx
        .update(platformAdminInvites)
        .set({ acceptedAt: new Date(), acceptedBy: user.id, updatedAt: new Date() })
        .where(eq(platformAdminInvites.id, invite.id));

      if (existing) {
        return existing.status === 'active' ? { admin: existing, user } : undefined;
      }

      const created = takeFirstOrThrow(
        await tx
          .insert(platformAdmins)
          .values({
            userId: user.id,
            status: 'active',
            invitedBy: invite.invitedBy,
            createdBy: invite.invitedBy,
          })
          .returning(),
        'platform admin',
      );

      return { admin: created, user };
    });

    if (!admin) {
      // Same message as a bad code, for the same reason as verifyOtp: this response is
      // returned to someone who has already proved they hold the handset.
      throw this.unauthenticated('That code is not valid.');
    }

    await this.otp.clear(OtpPurpose.CONSOLE, body.phone);

    this.logger.log({
      event: 'admin_auth.invite_accepted',
      adminId: admin.admin.id,
      userId: admin.user.id,
    });

    return this.startSession(
      { adminId: admin.admin.id, user: admin.user, lastSignedInAt: admin.admin.lastSignedInAt },
      'invite_accepted',
    );
  }

  /**
   * Rotates a console refresh token, re-reading the administrator from the database.
   *
   * The re-read is what bounds a suspension: even without the instant revocation epoch,
   * a suspended administrator's session dies at the next rotation rather than surviving for
   * the full refresh window. Both mechanisms are kept — the epoch makes it immediate, and
   * this makes it correct if Redis ever loses the key.
   */
  async refresh(refreshToken: string): Promise<v1.AdminRefreshResponse> {
    const tokens = await this.tokens.rotate(
      refreshToken,
      TokenAudience.CONSOLE,
      async (payload) => {
        const admin = await this.findActiveAdminByUserId(payload.sub);

        if (!admin) {
          throw this.unauthenticated('Your access has changed. Sign in again.');
        }

        const claims: SessionClaims = {
          userId: payload.sub,
          // Null studio and null membership are what MAKE this a platform session. The
          // guard permits the pair only for platform_admin and rejects it for every other
          // role, because a null studio read as "no filter" would mean every studio at once.
          studioId: null,
          role: Role.PLATFORM_ADMIN,
          membershipId: null,
        };
        return claims;
      },
    );

    return { tokens };
  }

  async me(userId: string): Promise<v1.AdminMeResponse> {
    const admin = await this.findActiveAdminByUserId(userId);

    if (!admin) {
      // Reachable when an administrator is suspended between the guard verifying their
      // token and this handler running. Rare, but the answer must be "sign in again".
      throw this.unauthenticated('Your access has changed. Sign in again.');
    }

    return { admin: toIdentity(admin) };
  }

  /** Ends the session. With a refresh token, the whole family dies. */
  async logout(accessJti: string, refreshToken?: string): Promise<v1.AdminLogoutResponse> {
    await this.tokens.revoke(accessJti, this.config.get('JWT_CONSOLE_ACCESS_TTL', { infer: true }));

    if (refreshToken) {
      // Decoded, not verified: an expired refresh token should still end its family, and
      // refusing to act would leave a stolen copy usable if it were merely stale.
      const payload = this.tokens.decodeRefresh(refreshToken);
      if (payload?.fam) await this.tokens.revokeFamily(payload.fam);
    }

    return { status: 'signed_out' };
  }

  // =====================================================================================
  // Provisioning
  // =====================================================================================

  /**
   * Creates an invite and returns its token ONCE.
   *
   * Any outstanding invite for the same number is revoked first, so re-inviting is a normal
   * action rather than a unique-constraint error — and so an old token read out over the
   * phone last week stops working the moment a new one is issued.
   */
  async createInvite(
    invitedBy: string,
    body: v1.CreateAdminInviteBody,
  ): Promise<v1.CreateAdminInviteResponse> {
    // 32 bytes of CSPRNG output. base64url so it survives being pasted into a chat window,
    // a URL, or read aloud without an encoding argument.
    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashInviteToken(token);

    const hours = body.expiresInHours || this.config.get('ADMIN_INVITE_TTL_HOURS', { infer: true });
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    const invite = await runAsSystem('admin-auth:create-invite', async (tx) => {
      const existingAdmin = takeFirst(
        await tx
          .select({ status: platformAdmins.status })
          .from(platformAdmins)
          .innerJoin(users, eq(users.id, platformAdmins.userId))
          .where(
            and(
              eq(users.phone, body.phone),
              isNull(users.deletedAt),
              isNull(platformAdmins.deletedAt),
            ),
          ),
      );

      /**
       * Refusing here is safe to be explicit about: the caller is already an authenticated
       * administrator, so "this number is already an admin" tells them nothing they could
       * not learn from the list endpoint they can also call.
       */
      if (existingAdmin?.status === 'active') {
        throw new HttpException(
          { code: ErrorCode.CONFLICT, message: 'That number is already a platform admin.' },
          HttpStatus.CONFLICT,
        );
      }

      if (existingAdmin?.status === 'suspended') {
        throw new HttpException(
          {
            code: ErrorCode.CONFLICT,
            message:
              'That number belongs to a suspended platform admin. Reinstate the account ' +
              'instead of inviting it again, so the audit trail shows what happened.',
          },
          HttpStatus.CONFLICT,
        );
      }

      // Supersede rather than collide. The partial unique index permits exactly one
      // outstanding invite per number, and re-inviting is a routine thing to do.
      await tx
        .update(platformAdminInvites)
        .set({ revokedAt: new Date(), revokedBy: invitedBy, updatedAt: new Date() })
        .where(
          and(
            eq(platformAdminInvites.phone, body.phone),
            isNull(platformAdminInvites.acceptedAt),
            isNull(platformAdminInvites.revokedAt),
            isNull(platformAdminInvites.deletedAt),
          ),
        );

      return takeFirstOrThrow(
        await tx
          .insert(platformAdminInvites)
          .values({
            phone: body.phone,
            tokenHash,
            expiresAt,
            invitedBy,
            createdBy: invitedBy,
          })
          .returning(),
        'invite',
      );
    });

    // Logged without the token and without the plaintext number: this line exists to answer
    // "who invited whom, and when", which needs neither.
    this.logger.log({
      event: 'admin_auth.invite_created',
      inviteId: invite.id,
      invitedBy,
      phoneHash: hashPhone(body.phone),
      expiresAt: expiresAt.toISOString(),
    });

    return {
      invite: toInviteSummary(invite),
      // The only time this value is ever readable. It is not stored, not logged, and cannot
      // be retrieved again — losing it means revoking and reissuing.
      inviteToken: token,
    };
  }

  async listInvites(): Promise<v1.ListAdminInvitesResponse> {
    const rows = await runAsSystem('admin-auth:list-invites', async (tx) =>
      tx
        .select()
        .from(platformAdminInvites)
        .where(
          and(
            isNull(platformAdminInvites.acceptedAt),
            isNull(platformAdminInvites.revokedAt),
            isNull(platformAdminInvites.deletedAt),
            // Expired invites are dead weight in a console list — they cannot be accepted,
            // and showing them invites someone to read a stale token out to a colleague.
            gt(platformAdminInvites.expiresAt, new Date()),
          ),
        ),
    );

    return { invites: rows.map(toInviteSummary) };
  }

  async revokeInvite(inviteId: string, revokedBy: string): Promise<v1.RevokeAdminInviteResponse> {
    const revoked = await runAsSystem('admin-auth:revoke-invite', async (tx) =>
      takeFirst(
        await tx
          .update(platformAdminInvites)
          .set({ revokedAt: new Date(), revokedBy, updatedAt: new Date() })
          .where(
            and(
              eq(platformAdminInvites.id, inviteId),
              isNull(platformAdminInvites.acceptedAt),
              isNull(platformAdminInvites.revokedAt),
              isNull(platformAdminInvites.deletedAt),
            ),
          )
          .returning({ id: platformAdminInvites.id }),
      ),
    );

    if (!revoked) {
      // Covers "no such invite", "already accepted" and "already revoked" with one answer.
      // Distinguishing them would confirm the existence of an invite id to someone guessing.
      throw new HttpException(
        { code: ErrorCode.NOT_FOUND, message: 'No outstanding invite with that id.' },
        HttpStatus.NOT_FOUND,
      );
    }

    this.logger.log({ event: 'admin_auth.invite_revoked', inviteId, revokedBy });
    return { status: 'revoked' };
  }

  async listAdmins(): Promise<v1.ListAdminsResponse> {
    const rows = await runAsSystem('admin-auth:list-admins', async (tx) =>
      tx
        .select({
          adminId: platformAdmins.id,
          userId: platformAdmins.userId,
          phone: users.phone,
          fullName: users.fullName,
          status: platformAdmins.status,
          lastSignedInAt: platformAdmins.lastSignedInAt,
          suspendedAt: platformAdmins.suspendedAt,
          createdAt: platformAdmins.createdAt,
        })
        .from(platformAdmins)
        .innerJoin(users, eq(users.id, platformAdmins.userId))
        .where(isNull(platformAdmins.deletedAt)),
    );

    return { admins: rows.map(toAdminSummary) };
  }

  /**
   * Suspends an administrator and kills every session they hold, immediately.
   *
   * Two refusals, both of which exist because the failure is unrecoverable without database
   * access — and the person who would need that access is the one who just locked themselves
   * out.
   */
  async suspend(adminId: string, actingUserId: string): Promise<v1.AdminStatusResponse> {
    const updated = await runAsSystem('admin-auth:suspend', async (tx) => {
      const target = takeFirst(
        await tx
          .select()
          .from(platformAdmins)
          .where(and(eq(platformAdmins.id, adminId), isNull(platformAdmins.deletedAt)))
          .for('update'),
      );

      if (!target) return { kind: 'not_found' as const };
      if (target.status === 'suspended') return { kind: 'already' as const };

      /**
       * Nobody suspends themselves. It is almost always a misclick on a list where your own
       * row looks like everyone else's, and the result is being locked out of the tool you
       * would use to undo it.
       */
      if (target.userId === actingUserId) {
        return { kind: 'self' as const };
      }

      /**
       * And never the last one standing. Counted INSIDE the same locked transaction, so two
       * simultaneous suspensions of the final two administrators cannot both see "two
       * active" and both succeed — which would leave the console permanently unreachable
       * and recoverable only by running the seed CLI with --force against production.
       */
      const active = await tx
        .select({ id: platformAdmins.id })
        .from(platformAdmins)
        .where(and(eq(platformAdmins.status, 'active'), isNull(platformAdmins.deletedAt)))
        .for('update');

      if (active.length <= 1) return { kind: 'last' as const };

      const row = takeFirstOrThrow(
        await tx
          .update(platformAdmins)
          .set({
            status: 'suspended',
            suspendedAt: new Date(),
            updatedBy: actingUserId,
            updatedAt: new Date(),
          })
          .where(eq(platformAdmins.id, adminId))
          .returning(),
        'platform admin',
      );

      const user = takeFirstOrThrow(
        await tx.select().from(users).where(eq(users.id, row.userId)),
        'user',
      );

      return { kind: 'suspended' as const, row, user };
    });

    if (updated.kind === 'not_found') {
      throw new HttpException(
        { code: ErrorCode.NOT_FOUND, message: 'No platform admin with that id.' },
        HttpStatus.NOT_FOUND,
      );
    }
    if (updated.kind === 'already') {
      throw new HttpException(
        { code: ErrorCode.CONFLICT, message: 'That admin is already suspended.' },
        HttpStatus.CONFLICT,
      );
    }
    if (updated.kind === 'self') {
      throw new HttpException(
        {
          code: ErrorCode.FORBIDDEN,
          message: 'You cannot suspend your own admin account. Ask another admin to do it.',
        },
        HttpStatus.FORBIDDEN,
      );
    }
    if (updated.kind === 'last') {
      throw new HttpException(
        {
          code: ErrorCode.CONFLICT,
          message:
            'That is the last active platform admin. Suspending it would lock everyone out ' +
            'of the console — invite a replacement first.',
        },
        HttpStatus.CONFLICT,
      );
    }

    /**
     * Sessions die NOW, not at the next token expiry.
     *
     * Revoking the refresh family alone would leave the suspended person's access token
     * working in an open browser tab for up to its full lifetime — during which they can
     * still suspend a gym, change a plan, or read every tenant's data. For an ordinary
     * member that window is a nuisance; here it is the entire reason the suspension was
     * pressed.
     */
    await this.tokens.revokeAllForUser(updated.row.userId);

    this.logger.warn({
      event: 'admin_auth.admin_suspended',
      adminId,
      targetUserId: updated.row.userId,
      actingUserId,
    });

    return { admin: toAdminSummary({ ...updated.row, adminId, ...pickUser(updated.user) }) };
  }

  async reinstate(adminId: string, actingUserId: string): Promise<v1.AdminStatusResponse> {
    const result = await runAsSystem('admin-auth:reinstate', async (tx) => {
      const row = takeFirst(
        await tx
          .update(platformAdmins)
          .set({
            status: 'active',
            // Cleared, not kept: the CHECK constraint in migration 0005 ties the two
            // together, so an active row holding a suspension timestamp cannot exist.
            suspendedAt: null,
            updatedBy: actingUserId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(platformAdmins.id, adminId),
              eq(platformAdmins.status, 'suspended'),
              isNull(platformAdmins.deletedAt),
            ),
          )
          .returning(),
      );

      if (!row) return undefined;

      const user = takeFirstOrThrow(
        await tx.select().from(users).where(eq(users.id, row.userId)),
        'user',
      );
      return { row, user };
    });

    if (!result) {
      throw new HttpException(
        { code: ErrorCode.NOT_FOUND, message: 'No suspended platform admin with that id.' },
        HttpStatus.NOT_FOUND,
      );
    }

    /**
     * The cut-off has to be cleared, or reinstatement would look like it worked and then
     * every fresh sign-in would be rejected by a stale epoch — a bug with no error message
     * anywhere, since the token really was issued before the revocation... of a suspension
     * that no longer exists.
     */
    await this.tokens.clearUserRevocation(result.row.userId);

    this.logger.warn({
      event: 'admin_auth.admin_reinstated',
      adminId,
      targetUserId: result.row.userId,
      actingUserId,
    });

    return { admin: toAdminSummary({ ...result.row, adminId, ...pickUser(result.user) }) };
  }

  // =====================================================================================

  private otpLimits(): OtpLimits {
    return {
      maxPerPhone: this.config.get('ADMIN_OTP_MAX_PER_PHONE', { infer: true }),
      maxPerIp: this.config.get('ADMIN_OTP_MAX_PER_IP', { infer: true }),
    };
  }

  /**
   * Whether sending an SMS to this number is warranted: an active administrator, or an
   * outstanding invite. Never surfaced to the caller — it only decides whether money is
   * spent on a message.
   */
  private async isEntitledToReceiveCode(phone: string): Promise<boolean> {
    return runAsSystem('admin-auth:check-otp-recipient', async (tx) => {
      const admin = takeFirst(
        await tx
          .select({ id: platformAdmins.id })
          .from(platformAdmins)
          .innerJoin(users, eq(users.id, platformAdmins.userId))
          .where(
            and(
              eq(users.phone, phone),
              eq(platformAdmins.status, 'active'),
              isNull(users.deletedAt),
              isNull(platformAdmins.deletedAt),
            ),
          ),
      );

      if (admin) return true;

      const invite = takeFirst(
        await tx
          .select({ id: platformAdminInvites.id })
          .from(platformAdminInvites)
          .where(
            and(
              eq(platformAdminInvites.phone, phone),
              isNull(platformAdminInvites.acceptedAt),
              isNull(platformAdminInvites.revokedAt),
              isNull(platformAdminInvites.deletedAt),
              gt(platformAdminInvites.expiresAt, new Date()),
            ),
          ),
      );

      return Boolean(invite);
    });
  }

  /** Mints the pair and stamps the sign-in. */
  private async startSession(
    admin: { adminId: string; user: typeof users.$inferSelect; lastSignedInAt: Date | null },
    reason: 'sign_in' | 'invite_accepted',
  ): Promise<v1.AdminSessionResponse> {
    const tokens = await this.tokens.issue(
      {
        userId: admin.user.id,
        studioId: null,
        role: Role.PLATFORM_ADMIN,
        membershipId: null,
      },
      TokenAudience.CONSOLE,
    );

    const signedInAt = new Date();
    await runAsSystem('admin-auth:stamp-sign-in', async (tx) => {
      await tx
        .update(platformAdmins)
        .set({ lastSignedInAt: signedInAt, updatedAt: signedInAt })
        .where(eq(platformAdmins.id, admin.adminId));
    });

    this.logger.log({
      event: 'admin_auth.session_started',
      reason,
      adminId: admin.adminId,
      userId: admin.user.id,
    });

    return {
      tokens,
      admin: {
        adminId: admin.adminId,
        userId: admin.user.id,
        phone: admin.user.phone,
        fullName: admin.user.fullName,
        lastSignedInAt: signedInAt.toISOString(),
      },
    };
  }

  private async findActiveAdminByPhone(phone: string): Promise<AdminRecord | undefined> {
    return runAsSystem('admin-auth:find-admin-by-phone', async (tx) =>
      takeFirst(
        await tx
          .select({
            adminId: platformAdmins.id,
            lastSignedInAt: platformAdmins.lastSignedInAt,
            user: users,
          })
          .from(platformAdmins)
          .innerJoin(users, eq(users.id, platformAdmins.userId))
          .where(
            and(
              eq(users.phone, phone),
              eq(platformAdmins.status, 'active'),
              isNull(users.deletedAt),
              isNull(platformAdmins.deletedAt),
            ),
          ),
      ),
    );
  }

  private async findActiveAdminByUserId(userId: string): Promise<AdminRecord | undefined> {
    return runAsSystem('admin-auth:find-admin-by-user', async (tx) =>
      takeFirst(
        await tx
          .select({
            adminId: platformAdmins.id,
            lastSignedInAt: platformAdmins.lastSignedInAt,
            user: users,
          })
          .from(platformAdmins)
          .innerJoin(users, eq(users.id, platformAdmins.userId))
          .where(
            and(
              eq(platformAdmins.userId, userId),
              eq(platformAdmins.status, 'active'),
              isNull(users.deletedAt),
              isNull(platformAdmins.deletedAt),
            ),
          ),
      ),
    );
  }

  /**
   * Identity is global, so an administrator who is also a gym member reuses their existing
   * row rather than becoming a second account a DPDP erasure would miss.
   *
   * Runs inside the caller's transaction, because accepting an invite must create the user
   * and the admin row atomically.
   */
  private async findOrCreateUser(
    tx: TenantTransaction,
    phone: string,
  ): Promise<typeof users.$inferSelect> {
    const existing = takeFirst(
      await tx
        .select()
        .from(users)
        .where(and(eq(users.phone, phone), isNull(users.deletedAt))),
    );
    if (existing) return existing;

    const inserted = takeFirst(
      await tx
        .insert(users)
        .values({ phone })
        .onConflictDoUpdate({
          target: users.phone,
          // The unique index on phone is PARTIAL, and Postgres requires the conflict target
          // to match it exactly — predicate included — or the statement fails outright.
          targetWhere: isNull(users.deletedAt),
          set: { updatedAt: new Date() },
        })
        .returning(),
    );

    if (inserted) return inserted;

    // The conflict target can miss a soft-deleted row; fall back to a read rather than
    // failing an otherwise valid activation.
    return takeFirstOrThrow(
      await tx
        .select()
        .from(users)
        .where(and(eq(users.phone, phone), isNull(users.deletedAt))),
      'user',
    );
  }

  private unauthenticated(message: string): HttpException {
    return new HttpException({ code: ErrorCode.UNAUTHENTICATED, message }, HttpStatus.UNAUTHORIZED);
  }
}

interface AdminRecord {
  adminId: string;
  lastSignedInAt: Date | null;
  user: typeof users.$inferSelect;
}

function toIdentity(record: AdminRecord): v1.AdminIdentity {
  return {
    adminId: record.adminId,
    userId: record.user.id,
    phone: record.user.phone,
    fullName: record.user.fullName,
    lastSignedInAt: record.lastSignedInAt?.toISOString() ?? null,
  };
}

function toInviteSummary(row: typeof platformAdminInvites.$inferSelect): v1.AdminInviteSummary {
  return {
    id: row.id,
    phone: row.phone,
    expiresAt: row.expiresAt.toISOString(),
    invitedBy: row.invitedBy,
    createdAt: row.createdAt.toISOString(),
  };
}

interface AdminSummaryRow {
  adminId: string;
  userId: string;
  phone: string;
  fullName: string | null;
  status: string;
  lastSignedInAt: Date | null;
  suspendedAt: Date | null;
  createdAt: Date;
}

function toAdminSummary(row: AdminSummaryRow): v1.AdminSummary {
  return {
    adminId: row.adminId,
    userId: row.userId,
    phone: row.phone,
    fullName: row.fullName,
    // Narrowed rather than cast: the CHECK constraint guarantees the column holds one of
    // these, but a cast would silently pass through a third value if the constraint were
    // ever relaxed, and the console would render a status it has no branch for.
    status: row.status === 'suspended' ? 'suspended' : 'active',
    lastSignedInAt: row.lastSignedInAt?.toISOString() ?? null,
    suspendedAt: row.suspendedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

function pickUser(user: typeof users.$inferSelect) {
  return { userId: user.id, phone: user.phone, fullName: user.fullName };
}

/**
 * SHA-256, matching the column. The token is 256 bits of CSPRNG output, so there is no
 * dictionary for a slow hash to defend against — a work factor would only add latency to a
 * path an attacker cannot iterate on anyway.
 */
function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Truncated, one-way, and stable — enough to correlate log lines, useless as a phone book. */
function hashPhone(phone: string): string {
  return createHash('sha256').update(phone).digest('hex').slice(0, 32);
}

/**
 * Length-safe constant-time string comparison.
 *
 * timingSafeEqual throws when the buffers differ in length, and the lengths here are
 * attacker-influenced (the submitted phone), so they are compared through a fixed-width
 * digest instead. That keeps the comparison constant time without the length itself
 * becoming the side channel.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}
