import { describe, expect, it } from 'vitest';

import { Role } from '../auth/roles.js';
import {
  logoutBody,
  meResponse,
  refreshBody,
  requestOtpBody,
  requestOtpResponse,
  switchStudioBody,
  verifyOtpBody,
  verifyOtpResponse,
} from './auth.contract.js';

/**
 * These schemas are the boundary the API validates against and every client infers types
 * from. A change here is a change to five apps at once, so the shapes are pinned.
 */

const STUDIO = '11111111-1111-4111-8111-111111111111';
const MEMBERSHIP = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const GYM = '44444444-4444-4444-8444-444444444444';

describe('requestOtpBody', () => {
  it('accepts a valid Indian mobile', () => {
    expect(requestOtpBody.safeParse({ phone: '+919876543210' }).success).toBe(true);
  });

  it.each([['9876543210'], ['+1 5551234567'], ['']])('rejects %j', (phone) => {
    expect(requestOtpBody.safeParse({ phone }).success).toBe(false);
  });

  /**
   * zod strips unknown keys, so a client cannot smuggle an extra field through to a
   * downstream insert. Asserted explicitly because it is a security property, not a
   * convenience.
   */
  it('strips unknown keys rather than passing them through', () => {
    const result = requestOtpBody.safeParse({ phone: '+919876543210', isAdmin: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ phone: '+919876543210' });
  });
});

describe('requestOtpResponse', () => {
  /**
   * The response must be identical for a registered and an unregistered number, or this
   * endpoint becomes a membership oracle. The schema encodes that by carrying no
   * account-specific field at all — this test fails if one is ever added.
   */
  it('carries nothing that could reveal whether the number is registered', () => {
    const shape = Object.keys(requestOtpResponse.shape).sort();
    expect(shape).toEqual(['expiresInSeconds', 'retryAfterSeconds', 'status']);
  });

  it('accepts the documented response', () => {
    expect(
      requestOtpResponse.safeParse({
        status: 'sent',
        retryAfterSeconds: 60,
        expiresInSeconds: 300,
      }).success,
    ).toBe(true);
  });

  it('rejects a non-positive countdown, which would render as an expired code', () => {
    expect(
      requestOtpResponse.safeParse({ status: 'sent', retryAfterSeconds: 0, expiresInSeconds: 300 })
        .success,
    ).toBe(false);
  });
});

describe('verifyOtpBody', () => {
  it('accepts phone and code', () => {
    expect(verifyOtpBody.safeParse({ phone: '+919876543210', otp: '123456' }).success).toBe(true);
  });

  it('accepts an explicit membership choice', () => {
    expect(
      verifyOtpBody.safeParse({ phone: '+919876543210', otp: '123456', membershipId: MEMBERSHIP })
        .success,
    ).toBe(true);
  });

  it.each([
    [{ phone: '+919876543210', otp: 'hunter' }, 'letters where digits belong'],
    [{ phone: '+919876543210', otp: '12345' }, 'too short'],
    [{ phone: '+919876543210', otp: '123456', membershipId: 'not-a-uuid' }, 'bad membership id'],
  ])('rejects %j — %s', (body) => {
    expect(verifyOtpBody.safeParse(body).success).toBe(false);
  });
});

describe('verifyOtpResponse', () => {
  const membership = {
    membershipId: MEMBERSHIP,
    studioId: STUDIO,
    studioName: 'Iron House',
    role: Role.GYM_USER,
  };

  const tokens = { accessToken: 'a', refreshToken: 'r', expiresInSeconds: 900 };

  it('accepts an authenticated session', () => {
    const result = verifyOtpResponse.safeParse({
      status: 'authenticated',
      tokens,
      membership,
      user: { id: USER, phone: '+919876543210', fullName: null },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a studio-selection response', () => {
    const result = verifyOtpResponse.safeParse({
      status: 'needsStudioSelection',
      selectionToken: 'tok',
      memberships: [membership, { ...membership, membershipId: GYM, studioName: 'Second' }],
    });
    expect(result.success).toBe(true);
  });

  /**
   * A discriminated union rather than optional fields, so a client cannot forget to handle
   * the multi-studio case — it will not typecheck without narrowing on `status`.
   */
  it('rejects a selection response with only one choice', () => {
    const result = verifyOtpResponse.safeParse({
      status: 'needsStudioSelection',
      selectionToken: 'tok',
      memberships: [membership],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a status it does not know', () => {
    expect(verifyOtpResponse.safeParse({ status: 'maybe', tokens }).success).toBe(false);
  });

  it('rejects an unknown role', () => {
    const result = verifyOtpResponse.safeParse({
      status: 'authenticated',
      tokens,
      membership: { ...membership, role: 'super_admin' },
      user: { id: USER, phone: '+919876543210', fullName: null },
    });
    expect(result.success).toBe(false);
  });

  it('allows a null name — a member added by phone may not have given one', () => {
    const result = verifyOtpResponse.safeParse({
      status: 'authenticated',
      tokens,
      membership,
      user: { id: USER, phone: '+919876543210', fullName: null },
    });
    expect(result.success).toBe(true);
  });
});

describe('refreshBody', () => {
  it('requires a non-empty token', () => {
    expect(refreshBody.safeParse({ refreshToken: 'x' }).success).toBe(true);
    expect(refreshBody.safeParse({ refreshToken: '' }).success).toBe(false);
    expect(refreshBody.safeParse({}).success).toBe(false);
  });
});

describe('switchStudioBody', () => {
  it('requires a membership id, not a studio id', () => {
    // Switching targets a MEMBERSHIP: naming a studio would not say which role to assume
    // if the user somehow held two there.
    expect(switchStudioBody.safeParse({ membershipId: MEMBERSHIP }).success).toBe(true);
    expect(switchStudioBody.safeParse({ studioId: STUDIO }).success).toBe(false);
  });
});

describe('logoutBody', () => {
  it('accepts an empty body — logging out without the refresh token is valid', () => {
    expect(logoutBody.safeParse({}).success).toBe(true);
  });

  it('accepts the refresh token, which ends the whole family', () => {
    expect(logoutBody.safeParse({ refreshToken: 'r' }).success).toBe(true);
  });
});

describe('meResponse', () => {
  it('accepts the full session view', () => {
    const membership = {
      membershipId: MEMBERSHIP,
      studioId: STUDIO,
      studioName: 'Iron House',
      role: Role.TRAINER,
    };

    const result = meResponse.safeParse({
      user: { id: USER, phone: '+919876543210', fullName: 'A Trainer' },
      membership,
      accessibleGymIds: [GYM],
      memberships: [membership],
    });

    expect(result.success).toBe(true);
  });

  /**
   * accessibleGymIds is sent so a client never has to derive branch access itself. If it
   * did, its idea of "which branches" could diverge from the server's — which is exactly
   * what filtering by registered_gym_id would cause.
   */
  it('always carries accessibleGymIds, even when empty', () => {
    const result = meResponse.safeParse({
      user: { id: USER, phone: '+919876543210', fullName: null },
      membership: {
        membershipId: MEMBERSHIP,
        studioId: STUDIO,
        studioName: 'Iron House',
        role: Role.GYM_USER,
      },
      memberships: [],
    });

    expect(result.success).toBe(false);
  });
});
