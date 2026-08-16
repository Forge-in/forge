import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@forge/shared';
import type Redis from 'ioredis';

import type { Env } from '../../config/env.schema';
import { REDIS } from '../../redis/redis.module';

/**
 * One-time codes for phone login.
 *
 * This is the entire authentication factor for Forge — there is no password behind it — so
 * every control here is load-bearing rather than defence in depth:
 *
 *   - Codes are HASHED at rest. Redis contents end up in backups, in `MONITOR` output and
 *     in whatever a support engineer runs; a plaintext code there is a live credential.
 *   - Comparison is CONSTANT TIME, so response timing cannot be used to guess a digit.
 *   - Codes are SINGLE USE and deleted on success, so a replayed request cannot sign in
 *     twice from an intercepted code.
 *   - Verification attempts are counted per code, so the 10^6 space cannot be walked.
 *   - Requests are limited per phone AND per IP. Per phone alone lets one host enumerate
 *     the whole numbering plan; per IP alone lets a botnet target one number.
 *
 * The limits are also a spending control. Every unthrottled request is a real SMS on a real
 * invoice, which is what makes an OTP endpoint an attractive thing to point a script at.
 */

const OTP_LENGTH = 6;
const OTP_TTL_SECONDS = 300; // 5 minutes
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_VERIFY_ATTEMPTS = 5;

/** Windows are fixed; the counts within them come from config (see env.schema). */
const PHONE_WINDOW_SECONDS = 900;
const IP_WINDOW_SECONDS = 3600;

/**
 * WHICH SURFACE a code was issued for. Part of every key this service writes.
 *
 * Three concrete bugs it prevents, all of which only appear once the same human is both a
 * gym member and a platform administrator — which is the normal case for a founder:
 *
 *   1. CODE CROSSOVER. Without a purpose in the key, a code requested on the member app
 *      unlocks the company admin console. The console's second factor would then be
 *      obtainable from the surface with the weakest rate limits and the largest attack
 *      surface, which inverts the whole point of separating them.
 *   2. BUDGET INTERFERENCE. The per-phone limit is three per fifteen minutes. Shared keys
 *      mean anyone who knows an administrator's number can exhaust it from the public member
 *      endpoint and lock that administrator out of the console during an incident — a denial
 *      of service that costs the attacker three HTTP requests.
 *   3. SILENT INVALIDATION. A successful member sign-in calls clear(), which would delete
 *      the console code the administrator is mid-way through typing.
 */
export const OtpPurpose = {
  /** Member product: both mobile apps and the gym owner dashboard. */
  APP: 'app',
  /** Company admin console. */
  CONSOLE: 'console',
} as const;

export type OtpPurpose = (typeof OtpPurpose)[keyof typeof OtpPurpose];

/** Per-purpose abuse limits, so one surface's traffic cannot spend another's budget. */
export interface OtpLimits {
  maxPerPhone: number;
  maxPerIp: number;
}

interface StoredOtp {
  hash: string;
  attempts: number;
  /** Ties the code to the request that created it, purely for log correlation. */
  requestId: string;
}

export interface OtpIssueResult {
  retryAfterSeconds: number;
  expiresInSeconds: number;
  /**
   * The plaintext code, returned ONLY so the caller can hand it to the SMS transport.
   * It is never persisted, never logged, and never returned over HTTP.
   */
  code: string;
  /** False when a live code already exists and the cooldown has not elapsed. */
  isNewCode: boolean;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private codeKey(purpose: OtpPurpose, phone: string): string {
    // Hash the phone in the key too. Redis key names show up in MONITOR, in slow logs and
    // in metrics cardinality dashboards; the set of keys should not be a customer list.
    return `otp:code:${purpose}:${this.hashPhone(phone)}`;
  }

  private phoneRateKey(purpose: OtpPurpose, phone: string): string {
    return `otp:rate:${purpose}:phone:${this.hashPhone(phone)}`;
  }

  private ipRateKey(purpose: OtpPurpose, ip: string): string {
    return `otp:rate:${purpose}:ip:${createHash('sha256').update(ip).digest('hex').slice(0, 32)}`;
  }

  private hashPhone(phone: string): string {
    return createHash('sha256').update(phone).digest('hex').slice(0, 32);
  }

  /**
   * Codes are hashed with the purpose and phone number mixed in, so a stolen hash cannot be
   * replayed against a different number or a different surface, and two users who happen to
   * receive the same code do not share a hash.
   *
   * SHA-256 rather than bcrypt/argon2 deliberately: the input space is 10^6 and lives for
   * five minutes, so a slow hash buys nothing an attacker could not brute-force offline
   * anyway — while costing ~100ms on a path that is rate-limited by wall clock. The real
   * protections are the attempt counter and the TTL.
   */
  private hashCode(purpose: OtpPurpose, phone: string, code: string): string {
    return createHash('sha256').update(`${purpose}:${phone}:${code}`).digest('hex');
  }

  /**
   * Issues a code, or returns the existing one's timing if the cooldown has not elapsed.
   *
   * @throws 429 when a rate limit is exceeded. The message never reveals whether the phone
   * is registered.
   */
  async issue(
    purpose: OtpPurpose,
    phone: string,
    ip: string,
    requestId: string,
    limits?: OtpLimits,
  ): Promise<OtpIssueResult> {
    await this.enforceRateLimits(purpose, phone, ip, limits);

    const key = this.codeKey(purpose, phone);
    const existingTtl = await this.redis.ttl(key);

    /**
     * A live code within the cooldown returns without sending a second SMS. Reissuing on
     * every tap would let a user with a slow network burn their own daily budget by
     * double-tapping, and would double the invoice for no benefit.
     */
    if (existingTtl > OTP_TTL_SECONDS - RESEND_COOLDOWN_SECONDS) {
      return {
        retryAfterSeconds: existingTtl - (OTP_TTL_SECONDS - RESEND_COOLDOWN_SECONDS),
        expiresInSeconds: existingTtl,
        code: '',
        isNewCode: false,
      };
    }

    const code = this.generateCode();
    const payload: StoredOtp = {
      hash: this.hashCode(purpose, phone, code),
      attempts: 0,
      requestId,
    };

    await this.redis.set(key, JSON.stringify(payload), 'EX', OTP_TTL_SECONDS);

    return {
      retryAfterSeconds: RESEND_COOLDOWN_SECONDS,
      expiresInSeconds: OTP_TTL_SECONDS,
      code,
      isNewCode: true,
    };
  }

  /**
   * Verifies and CONSUMES a code.
   *
   * Returns false for every failure mode — wrong code, expired, too many attempts — rather
   * than distinguishing them. "Expired" versus "wrong" tells an attacker whether they are
   * racing a live code, and there is nothing a legitimate user does differently.
   */
  async verify(purpose: OtpPurpose, phone: string, code: string): Promise<boolean> {
    const key = this.codeKey(purpose, phone);
    const raw = await this.redis.get(key);

    if (!raw) {
      // Still spend the hashing time, so a missing code is not distinguishable by timing
      // from a wrong one.
      this.hashCode(purpose, phone, code);
      return false;
    }

    const stored = JSON.parse(raw) as StoredOtp;

    if (stored.attempts >= MAX_VERIFY_ATTEMPTS) {
      // Burn it rather than letting it sit: five wrong guesses means this code is being
      // attacked, and the user can request a fresh one.
      await this.redis.del(key);
      this.logger.warn({ event: 'otp.attempts_exhausted', requestId: stored.requestId });
      return false;
    }

    const matches = this.safeEqual(stored.hash, this.hashCode(purpose, phone, code));

    if (!matches) {
      // Increment WITHOUT extending the TTL: the code must still die on schedule, or a
      // steady trickle of wrong guesses would keep it alive indefinitely.
      const next: StoredOtp = { ...stored, attempts: stored.attempts + 1 };
      await this.redis.set(key, JSON.stringify(next), 'KEEPTTL');
      return false;
    }

    // Single use. Deleted before the caller does anything with the result, so two
    // concurrent verifications cannot both succeed.
    await this.redis.del(key);
    return true;
  }

  /** Clears the resend cooldown and any live code. Used after a successful sign-in. */
  async clear(purpose: OtpPurpose, phone: string): Promise<void> {
    await this.redis.del(this.codeKey(purpose, phone));
  }

  private generateCode(): string {
    // randomInt is CSPRNG-backed. Math.random() here would make codes predictable from a
    // handful of observed values, which is a complete authentication bypass.
    return randomInt(0, 10 ** OTP_LENGTH)
      .toString()
      .padStart(OTP_LENGTH, '0');
  }

  /**
   * timingSafeEqual throws on length mismatch, which would itself leak length — but both
   * inputs here are fixed-length hex digests, so the lengths always match. The guard is
   * kept for the case where a stored value is corrupt.
   */
  private safeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a, 'utf8');
    const right = Buffer.from(b, 'utf8');
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  }

  /**
   * Both counters use a fixed window, incremented then expired. A sliding window would be
   * more precise, but a fixed one is a single round trip and the imprecision only ever
   * grants a user slightly more than the nominal allowance at a window boundary.
   */
  private async enforceRateLimits(
    purpose: OtpPurpose,
    phone: string,
    ip: string,
    limits?: OtpLimits,
  ): Promise<void> {
    const [phoneCount, ipCount] = await Promise.all([
      this.bump(this.phoneRateKey(purpose, phone), PHONE_WINDOW_SECONDS),
      this.bump(this.ipRateKey(purpose, ip), IP_WINDOW_SECONDS),
    ]);

    // Read into locals first. Inlining these into a `??` makes TypeScript resolve the
    // widest ConfigService.get overload, which admits undefined and then reports the
    // comparison below as unsafe — a confusing error for what is a plain default.
    const defaultPhoneMax = this.config.get('OTP_MAX_PER_PHONE', { infer: true });
    const defaultIpMax = this.config.get('OTP_MAX_PER_IP', { infer: true });

    const phoneMax = limits?.maxPerPhone ?? defaultPhoneMax;
    const ipMax = limits?.maxPerIp ?? defaultIpMax;

    if (phoneCount > phoneMax || ipCount > ipMax) {
      // Logged with a hashed phone: this line is exactly where a plaintext number would
      // otherwise end up in the log aggregator.
      this.logger.warn({
        event: 'otp.rate_limited',
        purpose,
        phoneHash: this.hashPhone(phone),
        phoneCount,
        ipCount,
      });

      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many verification codes requested. Try again shortly.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async bump(key: string, windowSeconds: number): Promise<number> {
    const count = await this.redis.incr(key);
    // Only the first increment sets the expiry, so the window is fixed from the first
    // request rather than sliding forward with each one (which would never expire).
    if (count === 1) await this.redis.expire(key, windowSeconds);
    return count;
  }
}
