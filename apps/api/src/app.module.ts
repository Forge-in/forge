import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ClsModule } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';

import { buildLoggerConfig } from './common/logging/logger.config';
import { CLS_KEYS, REQUEST_ID_HEADER } from './common/request-context';
import { ForgeConfigModule } from './config/config.module';
import type { Env } from './config/env.schema';
import { DatabaseModule } from './database/database.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ClientVersionGuard } from './common/guards/client-version.guard';
import { IdempotencyInterceptor } from './common/interceptors/idempotency.interceptor';
import { AdminAuthModule } from './modules/admin-auth/admin-auth.module';
import { AppConfigModule } from './modules/app-config/app-config.module';
import { AuthModule } from './modules/auth/auth.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    // First: everything below reads validated config, and boot must fail here rather than
    // half-way through initialising modules against a broken environment.
    ForgeConfigModule,

    /**
     * AsyncLocalStorage for request-scoped values. Seeded with the request id that
     * pino-http generated, so a log line emitted deep inside a service — with no access to
     * the request object — still correlates with the HTTP request that caused it.
     */
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: false,
        setup: (cls, req: { headers?: Record<string, unknown> }) => {
          const header = req.headers?.[REQUEST_ID_HEADER];
          cls.set(CLS_KEYS.requestId, Array.isArray(header) ? header[0] : (header ?? ''));
        },
      },
    }),

    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: buildLoggerConfig({
          level: config.get('LOG_LEVEL', { infer: true }),
          isProduction: config.get('NODE_ENV', { infer: true }) === 'production',
        }),
      }),
    }),

    DatabaseModule,
    RedisModule,
    AuthModule,
    // After AuthModule: it reuses that module's OTP and token services rather than
    // reimplementing the hard parts of either.
    AdminAuthModule,
    AppConfigModule,

    /**
     * Global rate-limit floor. OTP request/verify get their own much tighter, phone-keyed
     * limits when the auth module lands; these protect everything else in the meantime.
     */
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        return {
          throttlers: [
            {
              name: 'short',
              ttl: 1_000,
              limit: config.get('THROTTLE_PER_SECOND', { infer: true }),
            },
            {
              name: 'medium',
              ttl: 60_000,
              limit: config.get('THROTTLE_PER_MINUTE', { infer: true }),
            },
          ],

          /**
           * Redis, not the default in-process store. The default counts per container and
           * resets on every deploy, so with two instances a caller simply gets double the
           * allowance and a rolling restart clears everyone's budget. For OTP that is not
           * a throttling inconvenience — it is real SMS spend and an account-enumeration
           * budget that resets whenever we ship.
           */
          storage: new ThrottlerStorageRedisService(config.get('REDIS_URL', { infer: true })),

          /**
           * Probes only. Deliberately NOT disabled under NODE_ENV=test: a feature that
           * switches itself off in every test environment can never be tested, and rate
           * limiting is exactly the kind of thing that quietly stops working.
           *
           * The limits above are generous enough that ordinary suites do not trip them.
           */
          skipIf: (context) => {
            // Polled every few seconds forever; throttling them would pull instances out
            // of the load balancer during perfectly normal operation.
            const path = context.switchToHttp().getRequest<{ url?: string }>().url ?? '';
            return path === '/healthz' || path === '/readyz' || path === '/health';
          },
        };
      },
    }),

    HealthModule,
  ],
  /**
   * Guard order is the execution order, and it matters:
   *   1. Throttler  - reject floods before doing any crypto or database work
   *   2. JwtAuth    - verify the token and establish tenant context
   *   3. Roles      - reads request.user, so it must run after JwtAuth
   *
   * JwtAuthGuard is global, which makes auth DENY BY DEFAULT: a new controller is
   * protected the moment it exists, and opening a route requires an explicit @Public().
   * The inverse leaves every new endpoint public until someone remembers.
   */
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Last: an outdated build should be told to upgrade rather than told it is
    // unauthorised, so this runs only once the caller is known to be legitimate.
    { provide: APP_GUARD, useClass: ClientVersionGuard },

    // Opt-in per route via @Idempotent(). Registered globally so a route only has to
    // add the decorator, not remember to wire an interceptor as well.
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule {}
