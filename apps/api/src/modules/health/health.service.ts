import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { pingDatabase } from '@forge/db';
import Redis from 'ioredis';

import type { Env } from '../../config/env.schema';

export interface LivenessStatus {
  status: 'ok';
  uptime: number;
  timestamp: string;
  /** Build identity. Ends the "which build is on staging?" conversation permanently. */
  version: string;
  sha: string;
  builtAt: string;
}

export interface ReadinessStatus {
  status: 'ready' | 'not_ready';
  checks: Record<string, { ok: boolean; latencyMs?: number; error?: string }>;
  timestamp: string;
}

/**
 * Two probes, because liveness and readiness answer different questions and conflating
 * them causes opposite failures.
 *
 *   /healthz  - "is this process alive?" If it fails, the orchestrator KILLS the container.
 *   /readyz   - "should this instance receive traffic?" If it fails, it is removed from
 *               the load balancer but left running.
 *
 * Making liveness depend on Postgres is the classic outage amplifier: the database has a
 * brief blip, every liveness probe fails at once, the orchestrator restarts every
 * container simultaneously, and now a recovering database is hit by a thundering herd of
 * cold starts. Liveness must therefore check nothing external.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private redis: Redis | undefined;

  constructor(private readonly config: ConfigService<Env, true>) {}

  /** Dependency-free on purpose — see the class comment. */
  check(): LivenessStatus {
    return {
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.0.0',
      sha: this.config.get('GIT_SHA', { infer: true }),
      builtAt: this.config.get('BUILT_AT', { infer: true }),
    };
  }

  /** Checks the dependencies a request actually needs. Run in parallel; slowest wins. */
  async ready(): Promise<ReadinessStatus> {
    const [postgres, redis] = await Promise.all([this.checkPostgres(), this.checkRedis()]);

    const checks = { postgres, redis };
    const allOk = Object.values(checks).every((check) => check.ok);

    return {
      status: allOk ? 'ready' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    };
  }

  private async checkPostgres(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    const started = Date.now();
    try {
      // pingDatabase(), not runAsSystem(): the latter logs an audit warning on every call
      // so that unpinned access stays conspicuous, and a probe firing every few seconds
      // would bury that signal entirely.
      await pingDatabase();
      return { ok: true, latencyMs: Date.now() - started };
    } catch (error) {
      this.logger.warn({ event: 'readyz.postgres_failed', error: describe(error) });
      return { ok: false, latencyMs: Date.now() - started, error: describe(error) };
    }
  }

  private async checkRedis(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    const started = Date.now();
    try {
      this.redis ??= new Redis(this.config.get('REDIS_URL', { infer: true }), {
        // A readiness probe must answer quickly or the orchestrator times it out and draws
        // its own, less useful conclusion. Never queue behind a reconnect backoff.
        maxRetriesPerRequest: 1,
        connectTimeout: 2_000,
        lazyConnect: true,
        enableOfflineQueue: false,
      });

      if (this.redis.status !== 'ready') await this.redis.connect();
      await this.redis.ping();
      return { ok: true, latencyMs: Date.now() - started };
    } catch (error) {
      this.logger.warn({ event: 'readyz.redis_failed', error: describe(error) });
      return { ok: false, latencyMs: Date.now() - started, error: describe(error) };
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.redis?.quit().catch(() => undefined);
  }
}

/** Message only — a readiness body is unauthenticated, so it must not carry a stack. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
