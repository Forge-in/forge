import type { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema';
import { ConsoleOtpTransport, Msg91OtpTransport, createOtpTransport } from './otp-transport';

/**
 * Transport SELECTION, unit tested here because the e2e suite substitutes a recording
 * double and therefore never exercises this decision at all.
 *
 * The failure this guards against is the worst one available: shipping the console
 * transport to production. It would print a live credential into the log aggregator AND
 * silently deliver nothing, so users simply stop being able to sign in while every
 * dashboard stays green.
 */
function configWith(values: Partial<Record<keyof Env, unknown>>): ConfigService<Env, true> {
  return { get: (key: string) => values[key as keyof Env] } as unknown as ConfigService<Env, true>;
}

describe('createOtpTransport', () => {
  describe('production', () => {
    it('uses MSG91 when credentials are present', () => {
      const transport = createOtpTransport(
        configWith({ NODE_ENV: 'production', MSG91_AUTH_KEY: 'k', MSG91_OTP_TEMPLATE_ID: 't' }),
      );

      expect(transport).toBeInstanceOf(Msg91OtpTransport);
      expect(transport.name).toBe('msg91');
    });

    /**
     * Fails CLOSED. Refusing to start is far better than starting with a transport that
     * cannot deliver: a boot failure is noticed in minutes, silent non-delivery is noticed
     * when someone finally asks why signups stopped.
     */
    it('refuses to start without credentials rather than falling back', () => {
      expect(() => createOtpTransport(configWith({ NODE_ENV: 'production' }))).toThrow(
        /MSG91_AUTH_KEY is required in production/,
      );
    });

    it('never returns the console transport', () => {
      expect(() =>
        createOtpTransport(configWith({ NODE_ENV: 'production', MSG91_AUTH_KEY: '' })),
      ).toThrow();
    });
  });

  describe('development and test', () => {
    // DLT approval takes 1-3 weeks and phone OTP is the only way in, so everything else has
    // to be buildable and testable while it is pending.
    it('logs the code when there is no gateway configured', () => {
      const transport = createOtpTransport(configWith({ NODE_ENV: 'development' }));

      expect(transport).toBeInstanceOf(ConsoleOtpTransport);
      expect(transport.name).toBe('console');
    });

    // So DLT delivery can be exercised on staging before it is relied on in production.
    it('uses the real gateway when credentials are present', () => {
      const transport = createOtpTransport(
        configWith({ NODE_ENV: 'development', MSG91_AUTH_KEY: 'k', MSG91_OTP_TEMPLATE_ID: 't' }),
      );

      expect(transport).toBeInstanceOf(Msg91OtpTransport);
    });
  });
});

describe('ConsoleOtpTransport', () => {
  it('resolves without sending anything', async () => {
    const transport = new ConsoleOtpTransport();
    await expect(transport.send('+919876543210', '123456')).resolves.toBeUndefined();
  });
});

describe('Msg91OtpTransport', () => {
  it('throws rather than reporting success when unconfigured', async () => {
    const transport = new Msg91OtpTransport(configWith({}));

    // The caller turns this into a 503, so the user is told to retry instead of waiting
    // for an SMS that was never going to arrive.
    await expect(transport.send('+919876543210', '123456')).rejects.toThrow(/not configured/);
  });
});
