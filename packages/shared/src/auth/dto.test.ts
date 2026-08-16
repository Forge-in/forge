import { describe, expect, it } from 'vitest';

import { phoneSchema, requestOtpSchema, verifyOtpSchema } from './dto.js';

describe('phoneSchema', () => {
  it.each([
    ['+919876543210', 'typical Jio/Airtel number'],
    ['+916000000000', 'lowest allowed leading digit (6)'],
    ['+919999999999', 'highest allowed leading digit (9)'],
    ['+917012345678', 'leading 7'],
    ['+918012345678', 'leading 8'],
  ])('accepts %s — %s', (phone) => {
    expect(phoneSchema.safeParse(phone).success).toBe(true);
  });

  it.each([
    ['9876543210', 'missing +91 country code'],
    ['919876543210', 'country code without the +'],
    ['09876543210', 'STD 0 prefix instead of +91'],
    ['+91987654321', 'only 9 subscriber digits'],
    ['+9198765432101', '11 subscriber digits'],
    ['+915876543210', 'leading 5 — not a valid Indian mobile series'],
    ['+910876543210', 'leading 0'],
    ['+911876543210', 'leading 1'],
    ['+91 9876543210', 'space after the country code'],
    ['+91-9876543210', 'hyphen separator'],
    ['+91987654321a', 'trailing non-digit'],
    ['', 'empty string'],
    ['+91', 'country code only'],
    ['++919876543210', 'doubled plus'],
    ['+1 5551234567', 'non-Indian number'],
  ])('rejects %s — %s', (phone) => {
    expect(phoneSchema.safeParse(phone).success).toBe(false);
  });

  // Locks in a cross-language footgun: in Perl/Python `$` also matches just before a
  // trailing newline, so this same pattern would accept the value there. JavaScript's
  // `$` (without the `m` flag) is strict end-of-input. If this ever regresses — e.g. a
  // refactor to a multiline regex — an attacker could smuggle a newline into an SMS
  // payload or a log line.
  it('rejects a trailing newline', () => {
    expect(phoneSchema.safeParse('+919876543210\n').success).toBe(false);
  });

  it('surfaces the human-readable message rather than a raw regex', () => {
    const result = phoneSchema.safeParse('nope');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('Must be a valid +91 mobile number');
    }
  });
});

describe('requestOtpSchema', () => {
  it('accepts a valid phone', () => {
    expect(requestOtpSchema.safeParse({ phone: '+919876543210' }).success).toBe(true);
  });

  it('rejects a missing phone', () => {
    expect(requestOtpSchema.safeParse({}).success).toBe(false);
  });

  // zod strips unknown keys by default rather than erroring. Asserted explicitly so that
  // if we ever switch this to .strict() it is a conscious, test-breaking decision.
  it('strips unknown keys instead of rejecting them', () => {
    const result = requestOtpSchema.safeParse({ phone: '+919876543210', role: 'platform_admin' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ phone: '+919876543210' });
  });
});

describe('verifyOtpSchema', () => {
  it('accepts a 6-digit code', () => {
    expect(verifyOtpSchema.safeParse({ phone: '+919876543210', otp: '123456' }).success).toBe(true);
  });

  it('preserves leading zeros — the OTP is a string, never a number', () => {
    const result = verifyOtpSchema.safeParse({ phone: '+919876543210', otp: '000123' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.otp).toBe('000123');
  });

  it.each([
    ['12345', 'too short'],
    ['1234567', 'too long'],
    ['', 'empty'],
    ['hunter', 'six letters — length alone is not enough'],
    ['12 456', 'embedded space'],
    ['１２３４５６', 'full-width digits'],
    ['12.456', 'punctuation'],
    ['-12345', 'negative-looking'],
  ])('rejects %s — %s', (otp) => {
    expect(verifyOtpSchema.safeParse({ phone: '+919876543210', otp }).success).toBe(false);
  });

  it('rejects a valid OTP paired with an invalid phone', () => {
    expect(verifyOtpSchema.safeParse({ phone: '9876543210', otp: '123456' }).success).toBe(false);
  });
});
