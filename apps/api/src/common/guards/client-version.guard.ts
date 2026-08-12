import { CanActivate, ExecutionContext, HttpException, Injectable, Logger } from '@nestjs/common';
import { ErrorCode, v1 } from '@forge/shared';
import type { Request } from 'express';

import { AppConfigService } from '../../modules/app-config/app-config.service';

/** 426 Upgrade Required. Not present in Nest's HttpStatus enum. */
const UPGRADE_REQUIRED = 426;

/**
 * Rejects builds below the configured minimum.
 *
 * THIS is the enforcement, not the client-side check. The app also calls /app-config and can
 * show a nicer screen, but that only helps clients that ask — this catches the ones that
 * never call it, and it keeps working when the client-side check is itself what is broken.
 *
 * Why it has to exist before the first store release: **you cannot roll back an App Store
 * release.** If v1.0.0 ships without a version check, every user on v1.0.0 is permanently
 * unforceable and that build's API contract must be supported indefinitely. Adding the
 * mechanism later requires a new release, which the users who need it are by definition not
 * installing.
 *
 * expo-updates covers JS-only bugs. This covers native bugs and protocol breaks. Both are
 * needed; neither substitutes for the other.
 */
@Injectable()
export class ClientVersionGuard implements CanActivate {
  private readonly logger = new Logger(ClientVersionGuard.name);

  constructor(private readonly appConfig: AppConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const app = header(request, 'x-client-app');
    const version = header(request, 'x-client-version');
    const platform = header(request, 'x-client-platform');

    /**
     * No headers means it is not one of our mobile clients — curl, a health probe, a
     * server-to-server call. Allowed through: web clients update on refresh and have no
     * version to police, and blocking unidentified callers would break every integration.
     *
     * A mobile build that omits the headers therefore escapes this check, which is why the
     * shared api-client always sends them and why they are asserted in its tests.
     */
    if (!app || !version || !platform) return true;

    const parsedPlatform = v1.clientPlatform.safeParse(platform);
    if (!parsedPlatform.success) return true;

    // The version floor never applies to web: a browser gets the new bundle on reload, so
    // there is no stale install to force.
    if (parsedPlatform.data === 'web') return true;

    const config = await this.appConfig.get(app, parsedPlatform.data);

    if (config.maintenance) {
      throw new HttpException(
        {
          code: ErrorCode.SERVICE_UNAVAILABLE,
          message: config.maintenanceMessage ?? 'Forge is briefly unavailable for maintenance.',
        },
        503,
      );
    }

    if (v1.isBelowMinimum(version, config.minSupported)) {
      this.logger.warn({
        event: 'client.too_old',
        app,
        platform: parsedPlatform.data,
        version,
        minSupported: config.minSupported,
      });

      /**
       * The store URL travels in the body so the app can deep-link straight to the listing.
       * A blocking screen with no way forward is indistinguishable from a broken app.
       */
      throw new HttpException(
        {
          code: ErrorCode.CLIENT_TOO_OLD,
          message: config.message,
          details: config.storeUrl
            ? [{ path: 'storeUrl', code: 'upgrade_url', message: config.storeUrl }]
            : undefined,
        },
        UPGRADE_REQUIRED,
      );
    }

    return true;
  }
}

function header(request: Request, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
