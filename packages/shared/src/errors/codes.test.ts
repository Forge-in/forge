import { describe, expect, it } from 'vitest';

import { ErrorCode, isErrorEnvelope, isRetryable, type ErrorEnvelope } from './codes.js';

/**
 * These strings are a contract with five client apps, and clients branch on them to decide
 * what to show and whether to retry. Renaming one is a breaking change for every installed
 * mobile build — which cannot be force-updated instantly — so the values are pinned here.
 */
describe('ErrorCode', () => {
  it('has the exact wire values clients switch on', () => {
    expect(ErrorCode).toEqual({
      UNAUTHENTICATED: 'UNAUTHENTICATED',
      TOKEN_EXPIRED: 'TOKEN_EXPIRED',
      FORBIDDEN: 'FORBIDDEN',
      NOT_FOUND: 'NOT_FOUND',
      VALIDATION_FAILED: 'VALIDATION_FAILED',
      RATE_LIMITED: 'RATE_LIMITED',
      CLIENT_TOO_OLD: 'CLIENT_TOO_OLD',
      IDEMPOTENT_REPLAY: 'IDEMPOTENT_REPLAY',
      CONFLICT: 'CONFLICT',
      UNPROCESSABLE: 'UNPROCESSABLE',
      INTERNAL: 'INTERNAL',
      SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    });
  });

  it('keeps key and value identical, so a code cannot be mistyped into a silent mismatch', () => {
    for (const [key, value] of Object.entries(ErrorCode)) {
      expect(value).toBe(key);
    }
  });

  it('separates TOKEN_EXPIRED from UNAUTHENTICATED', () => {
    // The distinction drives client behaviour: expired means "refresh and replay",
    // unauthenticated means "send them to the login screen". Collapsing them would either
    // log people out on every access-token expiry or retry-loop on a genuinely bad token.
    expect(ErrorCode.TOKEN_EXPIRED).not.toBe(ErrorCode.UNAUTHENTICATED);
  });
});

describe('isRetryable', () => {
  it.each([ErrorCode.RATE_LIMITED, ErrorCode.SERVICE_UNAVAILABLE, ErrorCode.INTERNAL])(
    'treats %s as retryable',
    (code) => {
      expect(isRetryable(code)).toBe(true);
    },
  );

  it.each([
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.FORBIDDEN,
    ErrorCode.NOT_FOUND,
    ErrorCode.CONFLICT,
    ErrorCode.UNPROCESSABLE,
    ErrorCode.UNAUTHENTICATED,
    ErrorCode.TOKEN_EXPIRED,
    ErrorCode.IDEMPOTENT_REPLAY,
  ])('treats %s as not retryable', (code) => {
    expect(isRetryable(code)).toBe(false);
  });

  /**
   * CLIENT_TOO_OLD must never be retryable: the request cannot succeed until the user
   * installs a new build, so an auto-retrying client would spin forever against a 426 and
   * flatten the battery of every user on an outdated version.
   */
  it('never marks CLIENT_TOO_OLD retryable', () => {
    expect(isRetryable(ErrorCode.CLIENT_TOO_OLD)).toBe(false);
  });

  it('classifies every declared code without throwing', () => {
    for (const code of Object.values(ErrorCode)) {
      expect(typeof isRetryable(code)).toBe('boolean');
    }
  });
});

describe('isErrorEnvelope', () => {
  const envelope: ErrorEnvelope = {
    error: {
      code: ErrorCode.NOT_FOUND,
      message: 'Gym not found.',
      retryable: false,
      requestId: 'req-1',
      timestamp: '2026-08-12T00:00:00.000Z',
    },
  };

  it('accepts a well-formed envelope', () => {
    expect(isErrorEnvelope(envelope)).toBe(true);
  });

  it.each([
    [null, 'null'],
    [undefined, 'undefined'],
    ['a string', 'a string body'],
    [42, 'a number'],
    [{}, 'an empty object'],
    [{ error: null }, 'a null error'],
    [{ error: 'boom' }, 'a string error'],
    [{ error: { code: 'NOT_FOUND' } }, 'missing requestId'],
    [{ error: { requestId: 'r' } }, 'missing code'],
    [{ error: { code: 1, requestId: 'r' } }, 'non-string code'],
  ])('rejects %j — %s', (value) => {
    expect(isErrorEnvelope(value)).toBe(false);
  });

  /**
   * A client catching a network error gets an HTML error page or a proxy timeout body, not
   * our envelope. The guard has to say no to those rather than throwing while inspecting
   * them — otherwise the error handler itself becomes the crash.
   */
  it('rejects a gateway HTML body without throwing', () => {
    expect(isErrorEnvelope('<html><body>504 Gateway Timeout</body></html>')).toBe(false);
  });
});
