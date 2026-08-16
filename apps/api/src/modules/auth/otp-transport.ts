import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema';

/**
 * How a code reaches a phone.
 *
 * Behind an interface because MSG91 cannot deliver anything until TRAI DLT registration
 * completes — entity, header and template approval, which takes one to three weeks. Since
 * phone-OTP is the only way into Forge, that is a hard launch blocker with no code fix, and
 * every other part of auth has to be buildable and testable while it is pending.
 */
export interface OtpTransport {
  send(phone: string, code: string): Promise<void>;
  readonly name: string;
}

/**
 * Development and test.
 *
 * Logs the code at debug level so a developer can sign in without an SMS gateway. Guarded
 * three ways because "the dev transport ran in production" is the worst possible outcome:
 * it prints a live credential to the log aggregator AND nobody receives their code.
 *
 *   1. The factory refuses to select it when NODE_ENV=production.
 *   2. It logs at debug, which production does not emit (LOG_LEVEL defaults to info).
 *   3. The line is explicitly tagged so it is trivial to alert on.
 */
@Injectable()
export class ConsoleOtpTransport implements OtpTransport {
  readonly name = 'console';
  private readonly logger = new Logger(ConsoleOtpTransport.name);

  send(phone: string, code: string): Promise<void> {
    this.logger.debug(
      `[DEV ONLY — no SMS sent] OTP for ${phone} is ${code}. ` +
        'If you are seeing this in production, the transport is misconfigured.',
    );
    return Promise.resolve();
  }
}

/**
 * MSG91, used as a plain SMS pipe rather than as a managed OTP service.
 *
 * We generate, store and verify the code ourselves (see OtpService). Handing that to MSG91
 * would mean the rate limits, the attempt counter, the hashing and the single-use guarantee
 * all live in a vendor we cannot test against, and switching providers later would become
 * an authentication rewrite rather than a config change.
 */
@Injectable()
export class Msg91OtpTransport implements OtpTransport {
  readonly name = 'msg91';
  private readonly logger = new Logger(Msg91OtpTransport.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async send(phone: string, code: string): Promise<void> {
    const authKey = this.config.get('MSG91_AUTH_KEY', { infer: true });
    const templateId = this.config.get('MSG91_OTP_TEMPLATE_ID', { infer: true });

    if (!authKey || !templateId) {
      // Reached only if production booted without credentials — the env schema requires
      // them when NODE_ENV=production, so this is the last line rather than the first.
      throw new Error('MSG91 is not configured; cannot deliver OTP');
    }

    // MSG91 wants the number without the leading '+'.
    const recipient = phone.replace(/^\+/, '');

    const response = await fetch('https://control.msg91.com/api/v5/otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey: authKey },
      body: JSON.stringify({ template_id: templateId, mobile: recipient, otp: code }),
      // Without a timeout this hangs the request until the client gives up, and the user
      // taps resend — spending another SMS on a gateway that is already struggling.
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      // Body is read for the log but never surfaced to the caller: a gateway error can
      // echo back the number, and occasionally the code.
      const detail = await response.text().catch(() => '<unreadable>');
      this.logger.error({
        event: 'otp.transport_failed',
        status: response.status,
        detail: detail.slice(0, 300),
      });
      throw new Error(`MSG91 rejected the request (${response.status})`);
    }
  }
}

/**
 * Chooses the transport for the current environment.
 *
 * Fails closed: production never falls back to the console transport, because doing so
 * would silently stop delivering codes while looking healthy in every dashboard.
 */
export function createOtpTransport(config: ConfigService<Env, true>): OtpTransport {
  const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';

  /**
   * BOTH values, not just the auth key.
   *
   * An auth key alone cannot deliver anything — send() needs a template id and throws
   * without one. Treating a half-configured gateway as "configured" produced a trap during
   * DLT registration, which is exactly when it hurts: the auth key arrives from MSG91 weeks
   * before template approval, someone puts it in `.env`, and development breaks. The API
   * abandons the console transport, every sign-in 503s, and the OTP stops appearing in the
   * log — so there is no way in and no visible reason why.
   *
   * Requiring both means a partially-provisioned gateway degrades to "log the code", which
   * is the state the team is actually in for those weeks. It also matches the boot-time
   * schema, which has always required the pair in production (see env.schema.ts), and the
   * same "set both or neither" rule DEMO_PHONE/DEMO_OTP follow.
   */
  const hasCredentials =
    Boolean(config.get('MSG91_AUTH_KEY', { infer: true })) &&
    Boolean(config.get('MSG91_OTP_TEMPLATE_ID', { infer: true }));

  if (isProduction) {
    if (!hasCredentials) {
      throw new Error(
        'MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID are both required in production — ' +
          'refusing to start with a transport that cannot deliver OTPs.',
      );
    }
    return new Msg91OtpTransport(config);
  }

  // Outside production, use the real gateway only when it is FULLY configured so DLT
  // delivery can be exercised on staging; otherwise log the code.
  return hasCredentials ? new Msg91OtpTransport(config) : new ConsoleOtpTransport();
}
