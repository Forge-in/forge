import { describe, expect, it } from 'vitest';

import { Role } from './roles.js';
import { TokenAudience, TokenType, isStudioScoped, type AccessTokenPayload } from './token.js';

describe('TokenType', () => {
  /**
   * Access and refresh tokens use different secrets, so a refresh token cannot verify as an
   * access token. The `typ` claim is a second, cheap barrier: if the two secrets were ever
   * misconfigured to match, this is what still separates them.
   */
  it('distinguishes the two token kinds', () => {
    expect(TokenType.ACCESS).toBe('access');
    expect(TokenType.REFRESH).toBe('refresh');
    expect(TokenType.ACCESS).not.toBe(TokenType.REFRESH);
  });
});

describe('TokenAudience', () => {
  /**
   * The member product and the company admin console are separate surfaces. A token minted
   * for one must be worthless on the other, so that a console credential leaking anywhere
   * — a proxy log, an error report — does not become a working key to the whole product API.
   */
  it('separates the member product from the company admin console', () => {
    expect(TokenAudience.APP).toBe('app');
    expect(TokenAudience.CONSOLE).toBe('console');
    expect(TokenAudience.APP).not.toBe(TokenAudience.CONSOLE);
  });
});

describe('isStudioScoped', () => {
  const base = {
    sub: 'usr_1',
    jti: 'jti_1',
    typ: TokenType.ACCESS,
    aud: TokenAudience.APP,
  } as const;

  it('is true for an ordinary tenant-scoped session', () => {
    const payload: AccessTokenPayload = {
      ...base,
      studioId: 'studio_1',
      membershipId: 'mem_1',
      role: Role.GYM_OWNER,
    };
    expect(isStudioScoped(payload)).toBe(true);
  });

  /**
   * platform_admin legitimately has no studio. The danger is the inversion: treating a null
   * studio as "no filter" would read as access to EVERY studio at once, which is the single
   * most dangerous misreading this shape allows. The guard rejects a null studio on any
   * other role; this helper is what lets call sites narrow safely.
   */
  it('is false when there is no studio, so a null can never mean "all studios"', () => {
    const payload: AccessTokenPayload = {
      ...base,
      aud: TokenAudience.CONSOLE,
      studioId: null,
      membershipId: null,
      role: Role.PLATFORM_ADMIN,
    };
    expect(isStudioScoped(payload)).toBe(false);
  });

  it('is false for a half-populated payload', () => {
    expect(
      isStudioScoped({ ...base, studioId: 'studio_1', membershipId: null, role: Role.TRAINER }),
    ).toBe(false);
    expect(
      isStudioScoped({ ...base, studioId: null, membershipId: 'mem_1', role: Role.TRAINER }),
    ).toBe(false);
  });
});
