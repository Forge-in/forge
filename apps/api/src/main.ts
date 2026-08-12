/**
 * FIRST import, before anything else.
 *
 * The OpenTelemetry instrumentations patch modules like `http` and `pg` at require time, and
 * a module that is already loaded is never patched. Moving this below the Nest imports
 * silently produces an app with tracing enabled and no spans.
 *
 * No-op unless OTEL_ENABLED=true.
 */
import { startTracing, stopTracing } from './tracing';

startTracing();

import { Logger as NestLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import type { Env } from './config/env.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    /**
     * Razorpay verifies webhooks as an HMAC over the RAW request body. Once a JSON parser
     * has run the exact bytes are gone and the signature can never be checked. Enabling
     * this later means editing bootstrap during a payments launch, under time pressure,
     * with money on the line — so it goes in now, before anything needs it.
     */
    rawBody: true,
    /**
     * Buffer log lines until the pino logger is attached, so anything emitted during module
     * initialisation is formatted and redacted like everything else rather than printed raw.
     */
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService<Env, true>);

  // Shared with the e2e suite so the tests exercise the configuration that actually ships.
  configureApp(app, config);

  /**
   * Registers SIGTERM/SIGINT handlers so onApplicationShutdown runs, which is what drains
   * the database pools. Without it every deploy severs in-flight queries and the resulting
   * burst of errors gets blamed on whatever was being released.
   */
  app.enableShutdownHooks();

  // Flush pending spans last, so the spans for a crashing request survive it — those are
  // the ones worth having.
  process.on('SIGTERM', () => void stopTracing());
  process.on('SIGINT', () => void stopTracing());

  const port = config.get('PORT', { infer: true });
  await app.listen(port);

  new NestLogger('Bootstrap').log(
    `API listening on :${port} (${config.get('NODE_ENV', { infer: true })}) — ` +
      'routes under /api/v1, probes at /healthz and /readyz',
  );
}

void bootstrap();
