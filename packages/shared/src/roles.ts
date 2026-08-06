/**
 * Single source of truth for roles, shared by the API and every client.
 * Change here => type error everywhere it is used incorrectly.
 */
export const Role = {
  PLATFORM_ADMIN: 'platform_admin',
  GYM_OWNER: 'gym_owner',
  TRAINER: 'trainer',
  GYM_USER: 'gym_user',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

/** JWT payload shape both API (sign) and clients (decode) agree on. */
export interface AuthTokenPayload {
  sub: string; // user id
  tenantId: string | null; // gym_id; null only for platform_admin
  role: Role;
}
