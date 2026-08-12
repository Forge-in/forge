import { Inject, Injectable, Logger } from '@nestjs/common';
import { v1 } from '@forge/shared';
import type Redis from 'ioredis';

import { REDIS } from '../../redis/redis.module';

/**
 * Client release policy and feature flags, served from Redis.
 *
 * Redis rather than environment config for one reason that matters during an incident:
 * `minSupported` can be raised WITHOUT a deploy. If a shipped build turns out to corrupt
 * data, waiting for a pipeline before you can stop it serving traffic is the difference
 * between minutes and an hour.
 *
 * Defaults are permissive. A missing key must not lock every user out of the product —
 * failing closed here would turn a Redis blip into a total outage for every mobile client.
 */
@Injectable()
export class AppConfigService {
  private readonly logger = new Logger(AppConfigService.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  private key(app: string, platform: string): string {
    return `client:release:${app}:${platform}`;
  }

  async get(app: string, platform: v1.ClientPlatform): Promise<v1.AppConfigResponse> {
    const raw = await this.redis.get(this.key(app, platform)).catch((error: unknown) => {
      this.logger.warn({
        event: 'app_config.read_failed',
        message: error instanceof Error ? error.message : 'unknown',
      });
      return null;
    });

    if (!raw) return this.permissiveDefault();

    try {
      // Parsed through the contract so a hand-edited Redis value cannot serve a shape the
      // clients cannot read. Operators edit this by hand during incidents — exactly when a
      // typo is most likely and least affordable.
      return v1.appConfigResponse.parse(JSON.parse(raw));
    } catch (error) {
      this.logger.error({
        event: 'app_config.invalid_stored_value',
        message: error instanceof Error ? error.message : 'unknown',
      });
      return this.permissiveDefault();
    }
  }

  /**
   * Everything allowed.
   *
   * '0.0.0' as minSupported means no build is ever rejected by default, so an unconfigured
   * or unreachable release policy cannot brick every installed app.
   */
  private permissiveDefault(): v1.AppConfigResponse {
    return {
      minSupported: '0.0.0',
      latest: '0.0.0',
      message: 'A newer version of the app is available.',
      maintenance: false,
      flags: {},
    };
  }

  /** Used by an operator or a release job to raise the floor without deploying. */
  async set(app: string, platform: v1.ClientPlatform, config: v1.AppConfigResponse): Promise<void> {
    await this.redis.set(this.key(app, platform), JSON.stringify(config));
    this.logger.warn({
      event: 'app_config.updated',
      app,
      platform,
      minSupported: config.minSupported,
    });
  }
}
