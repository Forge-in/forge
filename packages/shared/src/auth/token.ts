import type { Role } from './roles.js';

/**
 * JWT payloads. The API signs these; every client decodes them.
 *
 * The token carries ONE active membership, not a list. A user who belongs to several
 * studios switches explicitly (POST /api/v1/auth/switch-studio), which reissues the pair.
 * That keeps every handler dealing with exactly one tenant, and keeps the blast radius of
 * a leaked token to one studio rather than all of them.
 */

/** Distinguishes the two token types even if a secret is ever misconfigured to match. */
export const TokenType = {
  ACCESS: 'access',
  REFRESH: 'refresh',
} as const;

export type TokenType = (typeof TokenType)[keyof typeof TokenType];

interface BaseTokenPayload {
  /** User id. Global — identity is one row per phone across all of Forge. */
  sub: string;
  /**
   * Unique token id. The revocation list is keyed on this, which is what makes "log out
   * this device" and "revoke a stolen token" possible without waiting for expiry.
   */
  jti: string;
  typ: TokenType;
  /** Seconds since epoch, set by the signer. */
  iat?: number;
  exp?: number;
}

export interface AccessTokenPayload extends BaseTokenPayload {
  typ: typeof TokenType.ACCESS;

  /**
   * The tenant. Null ONLY for platform_admin, which has no studio of its own.
   *
   * A null studioId on any other role must be treated as a rejected token rather than as
   * "all studios" — that inversion is the single most dangerous bug this shape can produce,
   * so the guard asserts it explicitly.
   */
  studioId: string | null;

  role: Role;

  /** The membership this session is acting as. Null for platform_admin. */
  membershipId: string | null;
}

export interface RefreshTokenPayload extends BaseTokenPayload {
  typ: typeof TokenType.REFRESH;

  /**
   * Token family. Every rotation issues a new jti within the same family, so presenting a
   * token that has already been rotated is detectable — and the response is to revoke the
   * whole family, because either the client or an attacker is replaying.
   */
  fam: string;

  /** Carried so a refresh can reissue an access token for the same membership. */
  membershipId: string | null;
  studioId: string | null;
}

export type AnyTokenPayload = AccessTokenPayload | RefreshTokenPayload;

/**
 * Historical name kept as an alias.
 *
 * The field was `tenantId` when the tenant was assumed to be a gym. It is `studioId` now
 * (see ADR 0001) and nothing consumed the old shape, but the alias means an import of the
 * old name fails loudly at the type level rather than resolving to something subtly
 * different.
 *
 * @deprecated Use AccessTokenPayload.
 */
export type AuthTokenPayload = AccessTokenPayload;

/** True when the payload is a usable access token for a tenant-scoped request. */
export function isStudioScoped(
  payload: AccessTokenPayload,
): payload is AccessTokenPayload & { studioId: string; membershipId: string } {
  return payload.studioId !== null && payload.membershipId !== null;
}
