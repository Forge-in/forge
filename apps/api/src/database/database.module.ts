import {
  Global,
  Logger,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { closeDb, initDb, setSystemAuditLogger } from '@forge/db';

import type { Env } from '../config/env.schema';

/**
 * Owns the database connection lifecycle.
 *
 * Note what this module does NOT export: any way to query. @forge/db keeps its pools
 * private and exposes only withTenant() and friends, so a service that wants data imports
 * those directly rather than injecting a repository that could be called without a tenant.
 */
@Global()
@Module({})
export class DatabaseModule implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit(): void {
    const readUrl = this.config.get('DATABASE_READ_URL', { infer: true });

    initDb({
      url: this.config.get('DATABASE_URL', { infer: true }),
      ...(readUrl ? { readUrl } : {}),
      maxConnections: this.config.get('DATABASE_POOL_MAX', { infer: true }),
    });

    /**
     * runAsSystem() runs with no tenant pinned, so every call is logged with a reason.
     * Routing that through Nest's logger rather than console.warn means it lands in the
     * same structured stream as everything else and can be alerted on — "no tenant context"
     * must never become the quiet default someone reaches for when a query is
     * inconveniently filtered.
     */
    setSystemAuditLogger(({ reason, at }) => {
      this.logger.warn({ event: 'db.runAsSystem', reason, at: at.toISOString() });
    });

    this.logger.log('database pools initialised');
  }

  /**
   * Drains on SIGTERM. Without this every deploy and every autoscale event severs in-flight
   * queries mid-transaction, which shows up as a burst of 500s on each release and gets
   * blamed on the change being deployed.
   *
   * Requires app.enableShutdownHooks() in main.ts — the hook is not registered otherwise.
   */
  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`closing database pools (signal: ${signal ?? 'none'})`);
    await closeDb();
  }
}
