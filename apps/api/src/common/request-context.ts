import type { Role } from '@forge/shared';

/** Echoed on every response so a user's screenshot maps to a log line. */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Per-request state, carried in AsyncLocalStorage via nestjs-cls.
 *
 * Deliberately narrow. This is ambient state, and ambient state is convenient enough that
 * it grows until nobody can tell what a handler actually depends on. Everything here has
 * to be available to the LOGGER, which is the one consumer that cannot take parameters.
 */
export interface RequestContext {
  requestId: string;

  /** Populated by the auth guard. Absent on public routes — that is not an error. */
  userId?: string;
  /**
   * The active membership's studio. The tenant.
   *
   * Present on the log line so a production question is answerable ("did this fail for one
   * studio or all of them?"). Never echoed back in a response body.
   */
  studioId?: string;
  membershipId?: string;
  role?: Role;

  /** From the x-client-* headers. Used by the forced-upgrade guard and for triage. */
  clientApp?: string;
  clientVersion?: string;
  clientPlatform?: string;
}

export const CLS_KEYS = {
  requestId: 'requestId',
  userId: 'userId',
  studioId: 'studioId',
  membershipId: 'membershipId',
  role: 'role',
} as const;
