import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, Role } from '@forge/shared';
import { memberships, resolveAccessibleGyms, withTenantRead } from '@forge/db';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';

import { IS_PUBLIC_KEY } from '../decorators/auth.decorators';
import { CLS_KEYS } from '../request-context';
import { TokenService } from '../../modules/auth/token.service';

/**
 * Verifies the bearer token and establishes request context.
 *
 * Registered globally, so routes are protected unless explicitly marked @Public. The
 * inverse — opting in per controller — makes every new endpoint public by default, and a
 * missing guard is invisible in a diff.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly cls: ClsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractBearer(request);

    if (!token) {
      throw new HttpException(
        { code: ErrorCode.UNAUTHENTICATED, message: 'Authentication required.' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Throws TOKEN_EXPIRED or UNAUTHENTICATED with the right envelope code.
    const payload = await this.tokens.verifyAccess(token);

    /**
     * The inversion that must never happen.
     *
     * studioId is null only for platform_admin. If any other role presents a token with a
     * null studio, it must be REJECTED — never treated as "no filter", which would read as
     * access to every studio at once. This is the single most dangerous misreading the
     * token shape allows, so it is checked explicitly rather than left to the query layer.
     */
    if (payload.role !== Role.PLATFORM_ADMIN && !payload.studioId) {
      this.logger.error({
        event: 'auth.null_studio_on_scoped_role',
        role: payload.role,
        userId: payload.sub,
      });
      throw new HttpException(
        { code: ErrorCode.UNAUTHENTICATED, message: 'Invalid credentials.' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    (request as Request & { user?: typeof payload }).user = payload;

    // Onto the CLS store so every log line for this request carries who and which studio,
    // without any handler having to pass it down.
    this.cls.set(CLS_KEYS.userId, payload.sub);
    this.cls.set(CLS_KEYS.studioId, payload.studioId ?? undefined);
    this.cls.set(CLS_KEYS.membershipId, payload.membershipId ?? undefined);
    this.cls.set(CLS_KEYS.role, payload.role);

    await this.attachAccessibleGyms(request, payload);

    return true;
  }

  /**
   * Resolves reachable gyms ONCE per request, here, rather than in each handler.
   *
   * One call site is the whole design: when single-branch passes ship, this function and a
   * table change, and nothing else does. A handler that resolved access itself would be the
   * place the rule gets applied inconsistently.
   */
  private async attachAccessibleGyms(
    request: Request,
    payload: { studioId: string | null; membershipId: string | null },
  ): Promise<void> {
    if (!payload.studioId || !payload.membershipId) {
      // platform_admin has no membership, so it has no gym access of its own. Cross-studio
      // views go through audited impersonation, which pins an explicit studio first.
      (request as Request & { accessibleGymIds?: string[] }).accessibleGymIds = [];
      return;
    }

    const membershipId = payload.membershipId;

    const gymIds = await withTenantRead(payload.studioId, async (tx) => {
      const rows = await tx.select().from(memberships).where(eq(memberships.id, membershipId));
      const membership = rows[0];

      // The membership was deleted or moved between issuing the token and now. Returning an
      // empty list rather than throwing keeps the request alive for endpoints that do not
      // touch gym-scoped data, and every gym-scoped query then matches nothing.
      if (!membership) return [];

      return resolveAccessibleGyms(tx, membership);
    });

    (request as Request & { accessibleGymIds?: string[] }).accessibleGymIds = gymIds;
  }

  private extractBearer(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header) return undefined;

    const [scheme, value] = header.split(' ');
    // Case-insensitive: clients and proxies are inconsistent about "Bearer" vs "bearer".
    return scheme?.toLowerCase() === 'bearer' && value ? value : undefined;
  }
}
