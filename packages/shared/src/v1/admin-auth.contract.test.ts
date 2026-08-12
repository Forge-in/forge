import { describe, expect, it } from 'vitest';

import {
  adminAcceptInviteBody,
  adminIdentity,
  adminLogoutBody,
  adminMeResponse,
  adminRefreshBody,
  adminRefreshResponse,
  adminRequestOtpBody,
  adminRequestOtpResponse,
  adminSessionResponse,
  adminStatusResponse,
  adminSummary,
  adminTokenPair,
  adminVerifyOtpBody,
  createAdminInviteBody,
  createAdminInviteResponse,
  listAdminInvitesResponse,
  listAdminsResponse,
  revokeAdminInviteResponse,
} from './admin-auth.contract.js';

/**
 * The console's wire contract. Narrower than the member one and far more dangerous to get
 * wrong: everything behind it can reach every tenant on the platform.
 *
 * Two properties are asserted as properties rather than as examples, because they are the
 * ones a well-meaning change would quietly break: the request-otp response must reveal
 * nothing about whether a number is an administrator, and the invite token must appear in
 * exactly one response shape.
 */

const ADMIN = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const INVITE = '33333333-3333-4333-8333-333333333333';
const PHONE = '+919876543210';
const NOW = '2026-08-12T09:30:00.000Z';

describe('adminRequestOtpBody', () => {
  it('accepts a valid Indian mobile', () => {
    expect(adminRequestOtpBody.safeParse({ phone: PHONE }).success).toBe(true);
  });

  it.each([['9876543210'], ['+1 5551234567'], ['']])('rejects %j', (phone) => {
    expect(adminRequestOtpBody.safeParse({ phone }).success).toBe(false);
  });

  // zod strips unknown keys, so a caller cannot smuggle a field through to a downstream
  // insert. Asserted because it is a security property, not a convenience.
  it('strips unknown keys rather than passing them through', () => {
    const result = adminRequestOtpBody.safeParse({ phone: PHONE, makeMeAdmin: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ phone: PHONE });
  });
});

describe('adminRequestOtpResponse', () => {
  /**
   * The list of phones that can reach every tenant is a handful of numbers. A response that
   * differed for an administrator would hand an attacker exactly the shortlist worth buying
   * a SIM swap for. The schema encodes the promise by carrying no account-specific field at
   * all; this test fails the moment one is added.
   */
  it('carries nothing that could reveal whether the number is an administrator', () => {
    expect(Object.keys(adminRequestOtpResponse.shape).sort()).toEqual([
      'expiresInSeconds',
      'retryAfterSeconds',
      'status',
    ]);
  });

  it('accepts the documented response', () => {
    expect(
      adminRequestOtpResponse.safeParse({
        status: 'sent',
        retryAfterSeconds: 60,
        expiresInSeconds: 300,
      }).success,
    ).toBe(true);
  });

  it.each([
    [{ status: 'queued', retryAfterSeconds: 60, expiresInSeconds: 300 }, 'a different status'],
    [{ status: 'sent', retryAfterSeconds: 0, expiresInSeconds: 300 }, 'a zero cooldown'],
    [{ status: 'sent', retryAfterSeconds: 60, expiresInSeconds: -1 }, 'a negative expiry'],
  ])('rejects %j — %s', (payload) => {
    expect(adminRequestOtpResponse.safeParse(payload).success).toBe(false);
  });
});

describe('adminVerifyOtpBody', () => {
  it('accepts a six-digit code', () => {
    expect(adminVerifyOtpBody.safeParse({ phone: PHONE, otp: '012345' }).success).toBe(true);
  });

  it.each([['12345'], ['1234567'], ['12 456'], ['hunter'], ['']])('rejects the code %j', (otp) => {
    expect(adminVerifyOtpBody.safeParse({ phone: PHONE, otp }).success).toBe(false);
  });

  /**
   * No membershipId, unlike the member contract. There is no studio for a console session to
   * be scoped to, and accepting one would mean the endpoint had somewhere to put it.
   */
  it('takes no studio or membership selection', () => {
    expect(Object.keys(adminVerifyOtpBody.shape).sort()).toEqual(['otp', 'phone']);
  });
});

describe('adminAcceptInviteBody', () => {
  const valid = { phone: PHONE, otp: '123456', inviteToken: 'a'.repeat(43) };

  it('accepts a token, a phone and a code together', () => {
    expect(adminAcceptInviteBody.safeParse(valid).success).toBe(true);
  });

  /**
   * BOTH factors are required in one request. Making either optional would create a
   * half-authenticated activation state — token accepted, code pending — which is precisely
   * the state an attacker wants to reach with a stolen invite.
   */
  it.each(['phone', 'otp', 'inviteToken'])('rejects a request missing %s', (field) => {
    const partial: Record<string, unknown> = { ...valid };
    delete partial[field];
    expect(adminAcceptInviteBody.safeParse(partial).success).toBe(false);
  });

  // Bounded so a megabyte of junk is rejected by the pipe rather than by a database lookup.
  it.each([['short'], ['b'.repeat(201)]])('rejects an out-of-range token %j', (inviteToken) => {
    expect(adminAcceptInviteBody.safeParse({ ...valid, inviteToken }).success).toBe(false);
  });
});

describe('adminTokenPair and adminIdentity', () => {
  const tokens = { accessToken: 'a.b.c', refreshToken: 'd.e.f', expiresInSeconds: 900 };
  const admin = {
    adminId: ADMIN,
    userId: USER,
    phone: PHONE,
    fullName: 'S. Rathore',
    lastSignedInAt: NOW,
  };

  it('accepts a complete session', () => {
    expect(adminSessionResponse.safeParse({ tokens, admin }).success).toBe(true);
    expect(adminMeResponse.safeParse({ admin }).success).toBe(true);
  });

  // Seconds, not an absolute time: client clocks are wrong often enough to matter.
  it('rejects a non-positive token lifetime', () => {
    expect(adminTokenPair.safeParse({ ...tokens, expiresInSeconds: 0 }).success).toBe(false);
  });

  // A first sign-in has no previous one, and an administrator may have no name recorded.
  it('allows a null name and a null last sign-in', () => {
    const result = adminIdentity.safeParse({ ...admin, fullName: null, lastSignedInAt: null });
    expect(result.success).toBe(true);
  });

  it('rejects an identity whose ids are not uuids', () => {
    expect(adminIdentity.safeParse({ ...admin, adminId: 'admin-1' }).success).toBe(false);
  });
});

describe('adminRefreshBody and adminRefreshResponse', () => {
  it('requires a non-empty refresh token', () => {
    expect(adminRefreshBody.safeParse({ refreshToken: 'x' }).success).toBe(true);
    expect(adminRefreshBody.safeParse({ refreshToken: '' }).success).toBe(false);
  });

  it('returns only a token pair', () => {
    const tokens = { accessToken: 'a', refreshToken: 'b', expiresInSeconds: 900 };
    expect(adminRefreshResponse.safeParse({ tokens }).success).toBe(true);
    expect(Object.keys(adminRefreshResponse.shape)).toEqual(['tokens']);
  });
});

describe('adminLogoutBody', () => {
  /**
   * Optional: logging out without it revokes only the current access token. With it, the
   * whole refresh family dies — which is what "sign out" has to mean on a shared machine.
   */
  it('accepts a logout with or without the refresh token', () => {
    expect(adminLogoutBody.safeParse({}).success).toBe(true);
    expect(adminLogoutBody.safeParse({ refreshToken: 'r' }).success).toBe(true);
    expect(adminLogoutBody.safeParse({ refreshToken: '' }).success).toBe(false);
  });
});

describe('createAdminInviteBody', () => {
  it('defaults the lifetime when the caller does not choose one', () => {
    const result = createAdminInviteBody.safeParse({ phone: PHONE });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.expiresInHours).toBe(72);
  });

  /**
   * Bounded at both ends. The floor stops an invite expiring between being created and being
   * read out over a phone call; the ceiling stops "set it to a year so I don't have to redo
   * it", which is how a standing grant to own the platform ends up in a chat history.
   */
  it.each([[0], [337], [1.5], [-24]])('rejects a lifetime of %j hours', (expiresInHours) => {
    expect(createAdminInviteBody.safeParse({ phone: PHONE, expiresInHours }).success).toBe(false);
  });

  it.each([[1], [72], [336]])('accepts a lifetime of %j hours', (expiresInHours) => {
    expect(createAdminInviteBody.safeParse({ phone: PHONE, expiresInHours }).success).toBe(true);
  });
});

describe('invite responses', () => {
  const invite = { id: INVITE, phone: PHONE, expiresAt: NOW, invitedBy: USER, createdAt: NOW };

  /**
   * THE ONE PLACE the plaintext token may appear.
   *
   * Everything else holds a SHA-256 hash. If `inviteToken` ever turns up on the list
   * response, a database read or a support query starts handing out live credentials to the
   * platform admin role — so the absence is asserted rather than assumed.
   */
  it('returns the token only from the create response', () => {
    expect(Object.keys(createAdminInviteResponse.shape).sort()).toEqual(['invite', 'inviteToken']);
    expect(Object.keys(listAdminInvitesResponse.shape)).toEqual(['invites']);
    expect(Object.keys(invite)).not.toContain('inviteToken');
  });

  it('accepts a created invite and a list of them', () => {
    expect(createAdminInviteResponse.safeParse({ invite, inviteToken: 'tok' }).success).toBe(true);
    expect(listAdminInvitesResponse.safeParse({ invites: [invite] }).success).toBe(true);
    expect(listAdminInvitesResponse.safeParse({ invites: [] }).success).toBe(true);
  });

  // ISO-8601, not a unix number: these cross a JSON boundary into a browser that has to
  // render them in a local timezone.
  it('rejects a non-ISO expiry', () => {
    expect(
      createAdminInviteResponse.safeParse({
        invite: { ...invite, expiresAt: '12 Aug 2026' },
        inviteToken: 'tok',
      }).success,
    ).toBe(false);
  });

  it('accepts a revocation', () => {
    expect(revokeAdminInviteResponse.safeParse({ status: 'revoked' }).success).toBe(true);
    expect(revokeAdminInviteResponse.safeParse({ status: 'deleted' }).success).toBe(false);
  });
});

describe('adminSummary', () => {
  const summary = {
    adminId: ADMIN,
    userId: USER,
    phone: PHONE,
    fullName: null,
    status: 'active',
    lastSignedInAt: null,
    suspendedAt: null,
    createdAt: NOW,
  };

  it('accepts both statuses and rejects anything else', () => {
    expect(adminSummary.safeParse(summary).success).toBe(true);
    expect(
      adminSummary.safeParse({ ...summary, status: 'suspended', suspendedAt: NOW }).success,
    ).toBe(true);
    // 'deleted' is not a status this schema knows: removal is a suspension plus a soft
    // delete, and a third value would need a branch in every console that renders one.
    expect(adminSummary.safeParse({ ...summary, status: 'deleted' }).success).toBe(false);
  });

  it('accepts a list and a single status change', () => {
    expect(listAdminsResponse.safeParse({ admins: [summary] }).success).toBe(true);
    expect(adminStatusResponse.safeParse({ admin: summary }).success).toBe(true);
  });
});
