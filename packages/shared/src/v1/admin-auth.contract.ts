import { z } from 'zod';

import { otpSchema, phoneSchema } from '../auth/dto.js';

/**
 * HTTP contracts for /api/v1/admin — the company admin console.
 *
 * SEPARATE FROM /api/v1/auth ON PURPOSE, not for tidiness.
 *
 * The member sign-in endpoint creates a user if none exists and signs them into a studio.
 * The console endpoint must do neither: there is no self-registration into the platform
 * admin role, and a session here is scoped to no studio at all. Sharing one endpoint would
 * mean one handler holding both behaviours apart with a branch — and the day that branch is
 * wrong, an ordinary member receives a platform-wide session.
 *
 * Two endpoints that cannot mint each other's tokens is a property you can read off the
 * routing table. A branch is a property you have to trust.
 *
 * Same versioning promise as the member contract: a v1 response may only ever GAIN optional
 * fields. Anything else is v2.
 */

/**
 * The token pair, re-declared here rather than imported from auth.contract.
 *
 * They are structurally identical today and that is fine. What is NOT fine is the two
 * drifting into each other: if the console later needs a field the member apps must not
 * receive (or the member apps gain one that has no meaning here), a shared schema turns
 * that into a change nobody can make without touching installed mobile builds. The
 * duplication is three lines and it keeps the two release cadences independent.
 */
export const adminTokenPair = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Seconds, not an absolute time: client clocks are wrong often enough to matter. */
  expiresInSeconds: z.number().int().positive(),
});
export type AdminTokenPair = z.infer<typeof adminTokenPair>;

/** The signed-in administrator. Deliberately thin — there is no tenant to describe. */
export const adminIdentity = z.object({
  adminId: z.string().uuid(),
  userId: z.string().uuid(),
  phone: phoneSchema,
  fullName: z.string().nullable(),
  lastSignedInAt: z.string().datetime().nullable(),
});
export type AdminIdentity = z.infer<typeof adminIdentity>;

// ---------------------------------------------------------------------------------------
// POST /api/v1/admin/auth/request-otp
// ---------------------------------------------------------------------------------------

export const adminRequestOtpBody = z.object({ phone: phoneSchema });
export type AdminRequestOtpBody = z.infer<typeof adminRequestOtpBody>;

/**
 * Says nothing about whether the number belongs to an administrator.
 *
 * The stakes are higher than on the member endpoint. There, a distinguishable response
 * would leak "this number is a customer of some gym". Here it would leak "this number can
 * see every gym on the platform" — a target list of, at any time, a handful of phones. That
 * is precisely the list worth buying a SIM swap for.
 *
 * So the response is byte-identical whether the number is an administrator, holds a pending
 * invite, or is a stranger's. Only the first two actually cause an SMS to be sent, which the
 * caller cannot observe unless they already hold the handset.
 */
export const adminRequestOtpResponse = z.object({
  status: z.literal('sent'),
  retryAfterSeconds: z.number().int().positive(),
  expiresInSeconds: z.number().int().positive(),
});
export type AdminRequestOtpResponse = z.infer<typeof adminRequestOtpResponse>;

// ---------------------------------------------------------------------------------------
// POST /api/v1/admin/auth/verify-otp
// ---------------------------------------------------------------------------------------

export const adminVerifyOtpBody = z.object({ phone: phoneSchema, otp: otpSchema });
export type AdminVerifyOtpBody = z.infer<typeof adminVerifyOtpBody>;

/**
 * A flat object rather than the member endpoint's discriminated union.
 *
 * There is no studio to select between: an administrator has exactly one identity and it is
 * scoped to the whole platform. Modelling a `status` field with one possible value would
 * invite a second one later, and the obvious second value ("needsSomething") is how a
 * partially-authenticated console state gets invented.
 */
export const adminSessionResponse = z.object({
  tokens: adminTokenPair,
  admin: adminIdentity,
});
export type AdminSessionResponse = z.infer<typeof adminSessionResponse>;

// ---------------------------------------------------------------------------------------
// POST /api/v1/admin/auth/accept-invite
// ---------------------------------------------------------------------------------------

/**
 * Activation, in ONE request that requires both factors at once.
 *
 * The invite token proves someone with console access approved this person. The OTP proves
 * possession of the number the invite names. Requiring both in a single call means there is
 * no intermediate "token accepted, awaiting code" state to attack, and no partially-created
 * admin row to clean up if the second step never arrives.
 *
 * The token is never sent over SMS. It is shown once to the inviting administrator, who
 * passes it over some other channel — so an attacker holding the SIM still cannot activate.
 */
export const adminAcceptInviteBody = z.object({
  phone: phoneSchema,
  otp: otpSchema,
  /**
   * 43 characters of base64url — 32 bytes of CSPRNG output.
   *
   * Bounded here rather than left as a bare string so a megabyte of junk is rejected by the
   * validation pipe before it reaches a database lookup or a hash.
   */
  inviteToken: z.string().min(20).max(200),
});
export type AdminAcceptInviteBody = z.infer<typeof adminAcceptInviteBody>;

// ---------------------------------------------------------------------------------------
// POST /api/v1/admin/auth/refresh
// ---------------------------------------------------------------------------------------

export const adminRefreshBody = z.object({ refreshToken: z.string().min(1) });
export type AdminRefreshBody = z.infer<typeof adminRefreshBody>;

export const adminRefreshResponse = z.object({ tokens: adminTokenPair });
export type AdminRefreshResponse = z.infer<typeof adminRefreshResponse>;

// ---------------------------------------------------------------------------------------
// GET /api/v1/admin/auth/me
// ---------------------------------------------------------------------------------------

export const adminMeResponse = z.object({ admin: adminIdentity });
export type AdminMeResponse = z.infer<typeof adminMeResponse>;

// ---------------------------------------------------------------------------------------
// POST /api/v1/admin/auth/logout
// ---------------------------------------------------------------------------------------

export const adminLogoutBody = z.object({
  /** With it, the whole refresh family dies — which is what "sign out" must mean here. */
  refreshToken: z.string().min(1).optional(),
});
export type AdminLogoutBody = z.infer<typeof adminLogoutBody>;

export const adminLogoutResponse = z.object({ status: z.literal('signed_out') });
export type AdminLogoutResponse = z.infer<typeof adminLogoutResponse>;

// ---------------------------------------------------------------------------------------
// Invites — POST/GET /api/v1/admin/invites, DELETE /api/v1/admin/invites/:id
// ---------------------------------------------------------------------------------------

export const createAdminInviteBody = z.object({
  phone: phoneSchema,
  /**
   * Bounded at both ends. A one-hour floor stops an invite expiring between being created
   * and being read out over a phone call; a two-week ceiling stops the "I'll set it to a
   * year so I don't have to redo it" habit, which is how a pre-authorisation to own the
   * platform ends up sitting in a chat history indefinitely.
   */
  expiresInHours: z.number().int().min(1).max(336).default(72),
});
export type CreateAdminInviteBody = z.infer<typeof createAdminInviteBody>;

export const adminInviteSummary = z.object({
  id: z.string().uuid(),
  phone: phoneSchema,
  expiresAt: z.string().datetime(),
  invitedBy: z.string().uuid(),
  createdAt: z.string().datetime(),
});
export type AdminInviteSummary = z.infer<typeof adminInviteSummary>;

/**
 * The ONLY response that ever carries the plaintext token.
 *
 * Everything else — the list endpoint, the database row, every log line — holds a SHA-256
 * hash. The plaintext exists exactly once, in this response body, and if the inviting
 * administrator loses it the invite is revoked and reissued rather than recovered. That is
 * the property that makes a leaked backup or an over-broad support query useless.
 */
export const createAdminInviteResponse = z.object({
  invite: adminInviteSummary,
  /** Show once, then never again. Deliver out-of-band, never by SMS to the invited number. */
  inviteToken: z.string(),
});
export type CreateAdminInviteResponse = z.infer<typeof createAdminInviteResponse>;

export const listAdminInvitesResponse = z.object({ invites: z.array(adminInviteSummary) });
export type ListAdminInvitesResponse = z.infer<typeof listAdminInvitesResponse>;

export const revokeAdminInviteResponse = z.object({ status: z.literal('revoked') });
export type RevokeAdminInviteResponse = z.infer<typeof revokeAdminInviteResponse>;

// ---------------------------------------------------------------------------------------
// Administrators — GET /api/v1/admin/admins, POST /api/v1/admin/admins/:id/{suspend,reinstate}
// ---------------------------------------------------------------------------------------

export const ADMIN_STATUS = ['active', 'suspended'] as const;

export const adminSummary = z.object({
  adminId: z.string().uuid(),
  userId: z.string().uuid(),
  phone: phoneSchema,
  fullName: z.string().nullable(),
  status: z.enum(ADMIN_STATUS),
  lastSignedInAt: z.string().datetime().nullable(),
  suspendedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type AdminSummary = z.infer<typeof adminSummary>;

export const listAdminsResponse = z.object({ admins: z.array(adminSummary) });
export type ListAdminsResponse = z.infer<typeof listAdminsResponse>;

export const adminStatusResponse = z.object({ admin: adminSummary });
export type AdminStatusResponse = z.infer<typeof adminStatusResponse>;
