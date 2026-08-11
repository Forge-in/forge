import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AccessTokenPayload, Role } from '@forge/shared';

/**
 * Auth is DENY BY DEFAULT: JwtAuthGuard is registered globally, so a new controller is
 * protected the moment it exists. Opening a route is an explicit, greppable act.
 *
 * The opposite arrangement — guards applied per controller — means every new endpoint is
 * public until someone remembers, and the omission looks like nothing at all in a diff.
 */
export const IS_PUBLIC_KEY = 'auth:isPublic';

/** Marks a route as reachable without a token. Use sparingly; each one is attack surface. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'auth:roles';

/**
 * Restricts a route to the listed roles.
 *
 * Roles gate WHAT KIND of user may call an endpoint. They say nothing about WHICH studio's
 * data comes back — that is row-level security, and it applies regardless. A gym_owner
 * passing this check still only ever sees their own studio.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Injects the verified token payload.
 *
 * Reading it off the request rather than decoding in the handler keeps exactly one place
 * that verifies a signature — a handler decoding its own token would be trusting an
 * unverified claim.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccessTokenPayload => {
    const request = context.switchToHttp().getRequest<{ user?: AccessTokenPayload }>();
    if (!request.user) {
      // Only reachable if a handler asks for the user on a @Public route — a programming
      // error, not a runtime condition.
      throw new Error('@CurrentUser used on a route with no authenticated user');
    }
    return request.user;
  },
);

/**
 * Injects the gyms this membership may reach, resolved once per request.
 *
 * Handlers must never derive this themselves. `registered_gym_id` records where a member
 * signed up, not what they may reach, and filtering by it would silently turn an all-access
 * chain pass into a single-branch one while looking entirely reasonable in review.
 */
export const AccessibleGyms = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string[] => {
    const request = context.switchToHttp().getRequest<{ accessibleGymIds?: string[] }>();
    return request.accessibleGymIds ?? [];
  },
);
