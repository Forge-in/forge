import type { Role } from './roles.js';

/** JWT payload shape both API (sign) and clients (decode) agree on. */
export interface AuthTokenPayload {
  sub: string; // user id
  tenantId: string | null; // gym_id; null only for platform_admin
  role: Role;
}
