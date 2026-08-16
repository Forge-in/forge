import { z } from 'zod';

import { otpSchema, phoneSchema } from '../auth/dto.js';
import { Role } from '../auth/roles.js';

/**
 * HTTP contracts for /api/v1/auth.
 *
 * Namespaced `v1` from the first endpoint. A shipped mobile build lives in the wild for
 * years and cannot be force-updated instantly, so v1 has to keep working long after v2
 * exists. Namespacing now costs nothing; renaming later is a breaking change for every app.
 *
 * The rule that keeps that promise: a v1 response may only ever GAIN optional fields.
 * Anything else — a removed field, a narrowed type, a changed meaning — is v2 plus a
 * minSupported bump.
 */

// ---------------------------------------------------------------------------------------
// POST /api/v1/auth/request-otp
// ---------------------------------------------------------------------------------------

export const requestOtpBody = z.object({ phone: phoneSchema });
export type RequestOtpBody = z.infer<typeof requestOtpBody>;

/**
 * Deliberately says nothing about whether the phone is registered.
 *
 * A response that differed — "OTP sent" versus "no such account" — turns this endpoint into
 * a membership oracle: anyone could enumerate which phone numbers belong to a gym. The
 * response is identical either way, and so is the timing budget.
 *
 * `retryAfterSeconds` is when another OTP may be requested for this number. It is safe to
 * return because it is the same for every number, registered or not.
 */
export const requestOtpResponse = z.object({
  status: z.literal('sent'),
  retryAfterSeconds: z.number().int().positive(),
  /** How long the code remains valid, so the client can show an accurate countdown. */
  expiresInSeconds: z.number().int().positive(),
});
export type RequestOtpResponse = z.infer<typeof requestOtpResponse>;

// ---------------------------------------------------------------------------------------
// POST /api/v1/auth/verify-otp
// ---------------------------------------------------------------------------------------

export const verifyOtpBody = z.object({
  phone: phoneSchema,
  otp: otpSchema,
  /**
   * Which membership to sign in as, when the phone has more than one.
   *
   * Omitted on a first sign-in; the API picks the only membership, or returns
   * `needsStudioSelection` with the choices when there are several. Sending a membership
   * the user does not own is a 403, never a silent fallback to a different one.
   */
  membershipId: z.string().uuid().optional(),
});
export type VerifyOtpBody = z.infer<typeof verifyOtpBody>;

export const membershipSummary = z.object({
  membershipId: z.string().uuid(),
  studioId: z.string().uuid(),
  studioName: z.string(),
  role: z.enum([Role.PLATFORM_ADMIN, Role.GYM_OWNER, Role.TRAINER, Role.GYM_USER]),
});
export type MembershipSummary = z.infer<typeof membershipSummary>;

export const tokenPair = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Seconds, not an absolute time: client clocks are wrong often enough to matter. */
  expiresInSeconds: z.number().int().positive(),
});
export type TokenPair = z.infer<typeof tokenPair>;

export const authSession = z.object({
  tokens: tokenPair,
  membership: membershipSummary,
  user: z.object({
    id: z.string().uuid(),
    phone: phoneSchema,
    fullName: z.string().nullable(),
  }),
});
export type AuthSession = z.infer<typeof authSession>;

/**
 * Either a signed-in session, or the list of memberships to choose from.
 *
 * A discriminated union rather than an optional-fields object, so a client cannot forget to
 * handle the multi-studio case — it will not typecheck without narrowing on `status`.
 */
export const verifyOtpResponse = z.discriminatedUnion('status', [
  z.object({ status: z.literal('authenticated') }).merge(authSession),
  z.object({
    status: z.literal('needsStudioSelection'),
    /** Short-lived; proves the OTP was verified so the code is not re-entered. */
    selectionToken: z.string(),
    memberships: z.array(membershipSummary).min(2),
  }),
]);
export type VerifyOtpResponse = z.infer<typeof verifyOtpResponse>;

// ---------------------------------------------------------------------------------------
// POST /api/v1/auth/refresh
// ---------------------------------------------------------------------------------------

export const refreshBody = z.object({ refreshToken: z.string().min(1) });
export type RefreshBody = z.infer<typeof refreshBody>;

export const refreshResponse = z.object({ tokens: tokenPair });
export type RefreshResponse = z.infer<typeof refreshResponse>;

// ---------------------------------------------------------------------------------------
// POST /api/v1/auth/switch-studio
// ---------------------------------------------------------------------------------------

/**
 * Named for what it does. Membership is sold at the STUDIO and an all-access pass already
 * reaches every branch, so "switch gym" would be meaningless — there is nothing to switch
 * between within a studio. Switching STUDIO is the real operation, for the trainer who
 * works at two businesses.
 */
export const switchStudioBody = z.object({ membershipId: z.string().uuid() });
export type SwitchStudioBody = z.infer<typeof switchStudioBody>;

export const switchStudioResponse = z.object({
  tokens: tokenPair,
  membership: membershipSummary,
});
export type SwitchStudioResponse = z.infer<typeof switchStudioResponse>;

// ---------------------------------------------------------------------------------------
// GET /api/v1/auth/me
// ---------------------------------------------------------------------------------------

export const meResponse = z.object({
  user: z.object({
    id: z.string().uuid(),
    phone: phoneSchema,
    fullName: z.string().nullable(),
  }),
  membership: membershipSummary,
  /**
   * Every gym this membership may reach, resolved once per request.
   *
   * Sent so a client can render a branch picker without a second call — and so the client's
   * idea of "which branches" can never diverge from the server's, which is what would
   * happen if each app derived it from registered_gym_id.
   */
  accessibleGymIds: z.array(z.string().uuid()),
  /** All memberships this person holds, so the app can offer a studio switcher. */
  memberships: z.array(membershipSummary),
});
export type MeResponse = z.infer<typeof meResponse>;

// ---------------------------------------------------------------------------------------
// POST /api/v1/auth/logout
// ---------------------------------------------------------------------------------------

export const logoutBody = z.object({
  /**
   * Optional: logging out without it revokes only the current access token. With it, the
   * whole refresh family dies, which is what "sign out" has to mean on a shared or stolen
   * device.
   */
  refreshToken: z.string().min(1).optional(),
});
export type LogoutBody = z.infer<typeof logoutBody>;

export const logoutResponse = z.object({ status: z.literal('signed_out') });
export type LogoutResponse = z.infer<typeof logoutResponse>;
