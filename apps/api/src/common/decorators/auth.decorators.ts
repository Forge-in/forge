import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { TokenAudience, type AccessTokenPayload, type Role } from '@forge/shared';

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

export const AUDIENCE_KEY = 'auth:audience';

/**
 * Declares WHICH SURFACE a controller serves, so a token minted for the other one is
 * rejected before its role is ever read.
 *
 * The default is `app` rather than "whichever the token claims", and that asymmetry is
 * deliberate. The member API is the large, fast-growing surface where a forgotten decorator
 * is likely; defaulting it to the member audience means the omission is harmless there. The
 * console is a handful of controllers added rarely and reviewed closely, so requiring the
 * marker on exactly those is a cost paid where the attention already is.
 *
 * Roles do not make this redundant. `@Roles(PLATFORM_ADMIN)` asks "is this caller an
 * administrator?"; this asks "was this credential issued for this surface?". A console
 * session leaking into the member API would satisfy the first question and fail the second,
 * which is the whole reason both exist.
 */
export const Audience = (audience: TokenAudience) => SetMetadata(AUDIENCE_KEY, audience);

/** Shorthand for the company admin console. */
export const ConsoleRoute = () => Audience(TokenAudience.CONSOLE);

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
