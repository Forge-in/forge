import { createHash, randomUUID } from 'node:crypto';

import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ErrorCode,
  TokenType,
  type AccessTokenPayload,
  type RefreshTokenPayload,
  type Role,
} from '@forge/shared';
import type Redis from 'ioredis';

import type { Env } from '../../config/env.schema';
import { REDIS } from '../../redis/redis.module';

/**
 * Issues, rotates and revokes tokens.
 *
 * Two mechanisms carry most of the weight, and both exist because of failures that only
 * appear on real mobile networks:
 *
 * ROTATION WITH REUSE DETECTION. Every refresh returns a new refresh token in the same
 * family. Presenting a token that has already been rotated means either an attacker has a
 * stolen copy or the client is confused; either way the whole family is revoked, so a theft
 * costs the attacker the session rather than granting them indefinite access.
 *
 * THE SUCCESSOR GRACE WINDOW. Rotation alone breaks legitimate clients. An app resuming
 * from background fires several requests at once, all get 401, all refresh, and the first
 * rotation invalidates the token the others are holding — so reuse detection fires and logs
 * the user out for behaving correctly. The fix has two halves and both are required: the
 * client single-flights its refresh, and the server, for a short window after a rotation,
 * returns the already-issued successor instead of revoking the family.
 *
 * Without the server half, a retry on a flaky Indian mobile network is enough to sign
 * someone out. This is the half that is usually missing.
 */

/** How long after rotation a just-superseded token still returns its successor. */
const SUCCESSOR_GRACE_SECONDS = 30;

interface RotationRecord {
  /** jti of the token issued to replace this one. */
  successorJti: string;
  /** The full replacement pair, so a racing request gets something usable. */
  successorRefreshToken: string;
  successorAccessToken: string;
  expiresInSeconds: number;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface SessionClaims {
  userId: string;
  studioId: string | null;
  role: Role;
  membershipId: string | null;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  // Keys are hashes, never raw tokens: a raw refresh token in a Redis key is a live
  // credential visible in MONITOR output and slow logs.
  private revokedKey(jti: string): string {
    return `auth:revoked:${jti}`;
  }
  private familyKey(family: string): string {
    return `auth:family:${family}`;
  }
  private rotationKey(jti: string): string {
    return `auth:rotated:${jti}`;
  }

  /**
   * Claim lock for a rotation in progress.
   *
   * Separate from the record key because the two answer different questions: "is someone
   * mid-rotation right now?" versus "what did that rotation produce?". A single key cannot
   * do both without a loser being unable to tell a placeholder from a real successor.
   */
  private rotationLockKey(jti: string): string {
    return `auth:rotating:${jti}`;
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /** Issues a fresh pair and starts a new token family. */
  async issue(claims: SessionClaims): Promise<IssuedTokens> {
    return this.mint(claims, randomUUID());
  }

  private async mint(claims: SessionClaims, family: string): Promise<IssuedTokens> {
    const accessTtl = this.config.get('JWT_ACCESS_TTL', { infer: true });
    const refreshTtl = this.config.get('JWT_REFRESH_TTL', { infer: true });

    const accessPayload: AccessTokenPayload = {
      sub: claims.userId,
      jti: randomUUID(),
      typ: TokenType.ACCESS,
      studioId: claims.studioId,
      role: claims.role,
      membershipId: claims.membershipId,
    };

    const refreshPayload: RefreshTokenPayload = {
      sub: claims.userId,
      jti: randomUUID(),
      typ: TokenType.REFRESH,
      fam: family,
      studioId: claims.studioId,
      membershipId: claims.membershipId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(accessPayload, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: accessTtl,
      }),
      this.jwt.signAsync(refreshPayload, {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
        expiresIn: refreshTtl,
      }),
    ]);

    // The family key is the kill switch for "sign out everywhere". Expiring it with the
    // refresh TTL means the bookkeeping cleans itself up.
    await this.redis.set(this.familyKey(family), 'active', 'EX', refreshTtl);

    return { accessToken, refreshToken, expiresInSeconds: accessTtl };
  }

  /** Verifies an access token. Throws the envelope codes clients branch on. */
  async verifyAccess(token: string): Promise<AccessTokenPayload> {
    let payload: AccessTokenPayload;

    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
    } catch (error) {
      // TOKEN_EXPIRED is separated from UNAUTHENTICATED on purpose: it tells the client to
      // refresh and replay, where UNAUTHENTICATED means send the user to the login screen.
      // Collapsing them either logs people out on every access-token expiry or retry-loops
      // on a genuinely bad token.
      const expired = error instanceof Error && error.name === 'TokenExpiredError';
      throw new HttpException(
        {
          code: expired ? ErrorCode.TOKEN_EXPIRED : ErrorCode.UNAUTHENTICATED,
          message: expired ? 'Access token has expired.' : 'Invalid credentials.',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    // A refresh token is signed with a different secret so it cannot verify here, but the
    // type claim is checked anyway — the cost is one comparison and it removes a whole
    // class of bug if the secrets are ever misconfigured to match.
    if (payload.typ !== TokenType.ACCESS) {
      throw new HttpException(
        { code: ErrorCode.UNAUTHENTICATED, message: 'Invalid credentials.' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (await this.isRevoked(payload.jti)) {
      throw new HttpException(
        { code: ErrorCode.UNAUTHENTICATED, message: 'Session has been revoked.' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    return payload;
  }

  /**
   * Rotates a refresh token.
   *
   * Order matters: the grace window is checked BEFORE reuse detection, or a legitimate
   * concurrent refresh would be treated as an attack.
   *
   * `resolveClaims` is a callback rather than data on the token, so the caller re-reads the
   * membership from the database on every refresh. That is what makes a demotion or a
   * removed membership take effect within one access-token lifetime instead of persisting
   * for the full 30-day refresh window — an offboarded trainer must not keep their access
   * simply because their session predates the change.
   */
  async rotate(
    refreshToken: string,
    resolveClaims: (payload: RefreshTokenPayload) => Promise<SessionClaims>,
  ): Promise<IssuedTokens> {
    let payload: RefreshTokenPayload;

    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
      });
    } catch {
      throw this.unauthenticated('Invalid or expired session. Please sign in again.');
    }

    if (payload.typ !== TokenType.REFRESH) {
      throw this.unauthenticated('Invalid credentials.');
    }

    // The whole family may already have been revoked by a logout or by an earlier reuse.
    if (!(await this.redis.exists(this.familyKey(payload.fam)))) {
      throw this.unauthenticated('Session has ended. Please sign in again.');
    }

    /**
     * The grace path. This token was already rotated moments ago, which on mobile means a
     * parallel request beat this one — not an attack. Returning the successor keeps every
     * racing caller working with the same new pair.
     */
    const alreadyRotated = await this.readRotation(payload.jti);
    if (alreadyRotated) {
      this.logger.debug({ event: 'auth.refresh_grace_hit', family: payload.fam });
      return alreadyRotated;
    }

    /**
     * Claim the rotation ATOMICALLY before doing anything else.
     *
     * Without this the read above and the write below are a check-then-act race: several
     * requests arriving in the same millisecond all see "not yet rotated" and each mints a
     * separate pair, so the client ends up holding whichever reply landed last while the
     * others are orphaned. It only shows up under genuine simultaneity — sequential curls
     * are staggered enough to hide it entirely, which is precisely why the automated test
     * that fires five at once is the one that caught it.
     *
     * SET NX is the claim. The loser waits for the winner's record rather than rotating.
     */
    const claimed = await this.redis.set(
      this.rotationLockKey(payload.jti),
      '1',
      'EX',
      SUCCESSOR_GRACE_SECONDS,
      'NX',
    );

    if (!claimed) {
      const successor = await this.awaitRotation(payload.jti);
      if (successor) {
        this.logger.debug({ event: 'auth.refresh_race_followed', family: payload.fam });
        return successor;
      }
      // The winner died mid-rotation. Failing closed is right: a second mint here would
      // produce exactly the split-brain the lock exists to prevent.
      throw this.unauthenticated('Could not refresh the session. Please try again.');
    }

    /**
     * Reuse detection. Past the grace window and already revoked means this token was
     * captured and replayed, so the family dies — the attacker loses the session and the
     * legitimate user is asked to sign in again, which is the safe direction.
     */
    if (await this.isRevoked(payload.jti)) {
      this.logger.error({
        event: 'auth.refresh_reuse_detected',
        family: payload.fam,
        userId: payload.sub,
      });
      await this.revokeFamily(payload.fam);
      throw this.unauthenticated('Session has ended. Please sign in again.');
    }

    // Authoritative claims come from the database, never from the presented token — a
    // token cannot be trusted to describe the permissions it should now carry.
    const claims = await resolveClaims(payload);
    const next = await this.mint(claims, payload.fam);

    const record: RotationRecord = {
      successorJti: this.hash(next.refreshToken).slice(0, 32),
      successorRefreshToken: next.refreshToken,
      successorAccessToken: next.accessToken,
      expiresInSeconds: next.expiresInSeconds,
    };

    await Promise.all([
      this.redis.set(
        this.rotationKey(payload.jti),
        JSON.stringify(record),
        'EX',
        SUCCESSOR_GRACE_SECONDS,
      ),
      this.revoke(payload.jti, this.config.get('JWT_REFRESH_TTL', { infer: true })),
    ]);

    return next;
  }

  /** Reads a completed rotation, if one exists. */
  private async readRotation(jti: string): Promise<IssuedTokens | undefined> {
    const raw = await this.redis.get(this.rotationKey(jti));
    if (!raw) return undefined;

    const record = JSON.parse(raw) as RotationRecord;
    return {
      accessToken: record.successorAccessToken,
      refreshToken: record.successorRefreshToken,
      expiresInSeconds: record.expiresInSeconds,
    };
  }

  /**
   * Waits briefly for the request that won the claim to publish its successor.
   *
   * Bounded and short: the winner only has to sign two JWTs and write one key. Waiting
   * longer would hold a request open behind a peer that has already failed, and the client
   * retrying is a better outcome than a socket held for seconds.
   */
  private async awaitRotation(jti: string): Promise<IssuedTokens | undefined> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const successor = await this.readRotation(jti);
      if (successor) return successor;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return undefined;
  }

  /** Adds a jti to the revocation list until it would have expired anyway. */
  async revoke(jti: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(this.revokedKey(jti), '1', 'EX', ttlSeconds);
  }

  /** Ends a whole session family — "sign out", or a response to reuse detection. */
  async revokeFamily(family: string): Promise<void> {
    await this.redis.del(this.familyKey(family));
  }

  async isRevoked(jti: string): Promise<boolean> {
    return (await this.redis.exists(this.revokedKey(jti))) === 1;
  }

  /** Decodes without verifying, for logout where an expired token is still actionable. */
  decodeRefresh(token: string): RefreshTokenPayload | null {
    try {
      return this.jwt.decode<RefreshTokenPayload>(token);
    } catch {
      return null;
    }
  }

  private unauthenticated(message: string): HttpException {
    return new HttpException({ code: ErrorCode.UNAUTHENTICATED, message }, HttpStatus.UNAUTHORIZED);
  }
}
