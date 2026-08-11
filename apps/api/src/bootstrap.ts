import { VersioningType } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import type { Env } from './config/env.schema';

/**
 * Every piece of application configuration, in one place, applied identically by main.ts
 * and by the e2e suite.
 *
 * This exists because the first version duplicated the setup in the test file, and the
 * duplicate immediately drifted — helmet was configured in main.ts and missing from the
 * tests, so the suite asserted security headers that the tests themselves had disabled.
 * A comment saying "keep these in sync" would not have caught it; sharing the function does.
 *
 * Not called: `listen()`. That stays in main.ts so tests can drive the app in-process.
 */
export function configureApp(
  app: NestExpressApplication,
  config: ConfigService<Env, true>,
): NestExpressApplication {
  const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';

  /**
   * Behind a load balancer every request appears to come from the proxy. Without this,
   * rate limiting keys every caller to one address, so a single abusive client throttles
   * everyone and per-IP OTP limits stop meaning anything. An explicit hop count rather
   * than `true`: trusting all hops lets a client spoof X-Forwarded-For and choose its own
   * rate-limit bucket.
   */
  app.set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }));

  app.use(helmet());

  /**
   * An explicit allowlist, never a reflected origin — with credentials enabled a wildcard
   * is rejected by browsers anyway, and reflecting whatever origin asked is the same as
   * having no policy.
   *
   * x-request-id must be exposed or browser clients cannot read it, which defeats the
   * point of returning it.
   */
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
    exposedHeaders: ['x-request-id', 'Retry-After'],
  });

  // Probes stay at the root: they are consumed by orchestrators, and putting them behind a
  // versioned prefix means a load balancer change on every version bump.
  app.setGlobalPrefix('api', { exclude: ['healthz', 'readyz', 'health'] });

  /**
   * URI versioning from the first endpoint. A shipped mobile build lives in the wild for
   * years and cannot be force-updated instantly, so v1 has to keep working long after v2
   * exists. Adding the prefix now is free; adding it after release breaks every install.
   */
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalFilters(new AllExceptionsFilter(isProduction));

  return app;
}
