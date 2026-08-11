import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import type { Env } from '../config/env.schema';

/** Injection token. A symbol, so nothing can collide with it by string coincidence. */
export const REDIS = Symbol('REDIS');

/**
 * One Redis connection for the whole API.
 *
 * Redis is not a cache here — it holds OTP codes, the token revocation list and rate-limit
 * counters, all of which are correctness state. Losing them does not degrade performance,
 * it lets an expired OTP be reused or a revoked token keep working. That is why REDIS_URL
 * is required at boot rather than optional with an in-memory fallback: the fallback would
 * work perfectly on one container and silently stop working on two.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Redis => {
        const logger = new Logger('Redis');

        const client = new Redis(config.get('REDIS_URL', { infer: true }), {
          /**
           * Fail a command after a few attempts rather than queueing it forever. An OTP
           * verification that hangs for thirty seconds is worse than one that errors: the
           * user has already given up and requested a second code, which costs real money
           * and burns their rate-limit budget.
           */
          maxRetriesPerRequest: 3,
          connectTimeout: 5_000,
          /**
           * Reconnect with backoff, capped. Without a cap a long outage produces a
           * reconnect storm the moment Redis comes back, from every container at once.
           */
          retryStrategy: (times) => Math.min(times * 200, 3_000),
          enableReadyCheck: true,
        });

        // An unhandled 'error' event on an ioredis client takes the process down. Logging
        // it keeps a transient blip from being a crash, while still surfacing a real outage
        // — /readyz reports the connection state separately, so this is not hiding it.
        client.on('error', (error: Error) => {
          logger.warn({ event: 'redis.error', message: error.message });
        });

        client.on('ready', () => {
          logger.log('redis connected');
        });

        return client;
      },
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisModule.name);

  // @Inject is required: REDIS is a symbol token, so Nest cannot resolve it from the
  // parameter's TypeScript type the way it does for classes.
  constructor(@Inject(REDIS) private readonly client: Redis) {}

  /**
   * `quit()` finishes in-flight commands before closing, unlike `disconnect()` which drops
   * them. During a deploy that is the difference between an OTP write completing and a
   * user being told their code is invalid.
   */
  async onApplicationShutdown(): Promise<void> {
    this.logger.log('closing redis connection');
    await this.client.quit().catch(() => this.client.disconnect());
  }
}
