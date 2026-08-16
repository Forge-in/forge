import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, type AccessTokenPayload, type Role } from '@forge/shared';
import type { Request } from 'express';

import { ROLES_KEY } from '../decorators/auth.decorators';

/**
 * Checks @Roles on a route.
 *
 * Runs AFTER JwtAuthGuard, so `request.user` is a verified payload rather than a claim.
 *
 * What this is not: it is coarse gating of endpoint kinds, not data scoping. Row-level
 * security decides which studio's rows come back and applies to every request regardless of
 * role — so passing this guard never widens what a caller can see, it only decides whether
 * the handler runs at all. Keeping those two concerns separate is what stops "is this
 * endpoint allowed?" and "whose data is this?" from being answered in the same place, badly.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles means "any authenticated user". JwtAuthGuard has already run, so this is
    // not an unguarded route.
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AccessTokenPayload }>();
    const user = request.user;

    if (!user) {
      // @Roles on a @Public route is a mistake worth failing loudly on, rather than
      // quietly allowing through because there is nobody to check.
      throw new HttpException(
        { code: ErrorCode.UNAUTHENTICATED, message: 'Authentication required.' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (!required.includes(user.role)) {
      this.logger.warn({
        event: 'auth.role_denied',
        userId: user.sub,
        role: user.role,
        required,
      });

      /**
       * 403 with a deliberately vague message. Naming the required role tells an attacker
       * exactly which account to go after, and confirming the resource exists is its own
       * disclosure — for endpoints where existence itself is sensitive, prefer 404.
       */
      throw new HttpException(
        { code: ErrorCode.FORBIDDEN, message: 'You do not have access to this resource.' },
        HttpStatus.FORBIDDEN,
      );
    }

    return true;
  }
}
