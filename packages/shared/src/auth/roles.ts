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
