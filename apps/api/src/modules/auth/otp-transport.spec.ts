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
        /MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID are both required/,
      );
    });

    // Half-configured is not configured: an auth key with no template cannot deliver, and
    // booting on it would mean discovering that on the first sign-in attempt instead of here.
    it.each<[Partial<Record<keyof Env, unknown>>, string]>([
      [{ MSG91_AUTH_KEY: 'k' }, 'a template id'],
      [{ MSG91_OTP_TEMPLATE_ID: 't' }, 'an auth key'],
    ])('refuses to start when missing %s', (partial) => {
      expect(() => createOtpTransport(configWith({ NODE_ENV: 'production', ...partial }))).toThrow(
        /both required/,
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

    /**
     * THE TRAP THIS CLOSES, and it is a real one rather than a hypothetical.
     *
     * MSG91 hands over the auth key immediately; the template id only exists after TRAI DLT
     * approval, one to three weeks later. In between, the obvious thing to do is put the key
     * in `.env` so it is not lost — and before this, that switched the API onto a gateway
     * that could not deliver. Sign-in returned 503 and the code stopped appearing in the
     * log, so the whole team lost local sign-in with nothing explaining why.
     *
     * Keeping the console transport until BOTH values exist means the half-provisioned
     * state, which is where the project genuinely sits for those weeks, just works.
     */
    it.each<[Partial<Record<keyof Env, unknown>>, string]>([
      [{ MSG91_AUTH_KEY: 'k' }, 'only the auth key is set (template still awaiting DLT)'],
      [{ MSG91_OTP_TEMPLATE_ID: 't' }, 'only the template id is set'],
    ])('still logs the code when %#: %s', (partial) => {
      const transport = createOtpTransport(configWith({ NODE_ENV: 'development', ...partial }));

      expect(transport).toBeInstanceOf(ConsoleOtpTransport);
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
