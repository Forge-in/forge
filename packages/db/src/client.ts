import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';

import * as schema from './schema/index.js';

/**
 * Connection pools. Private to this package on purpose — nothing outside it should ever
 * hold a handle that can issue a query without a tenant context. The only exported way
 * to reach the database is withTenant()/withTenantRead()/runAsSystem() in tenant.ts.
 *
 * An ESLint rule enforces the same thing statically, because a comment is not a guarantee.
 */

export type ForgeDatabase = NodePgDatabase<typeof schema>;

export interface DbConfig {
  /** Runtime connection. MUST be the forge_app role: NOSUPERUSER, NOBYPASSRLS, owns nothing. */
  url: string;
  /** Optional read replica. Same role, same policies. Falls back to `url` when absent. */
  readUrl?: string | undefined;
  /**
   * Keep well under the managed-Postgres connection cap, remembering the cap is shared
   * across every running container. Exhausting it takes the whole API down, not one request.
   */
  maxConnections?: number | undefined;
  /** Fail fast rather than queueing forever behind an exhausted pool. */
  connectionTimeoutMillis?: number | undefined;
  ssl?: PoolConfig['ssl'];
}

let writePool: Pool | undefined;
let readPool: Pool | undefined;
let writeDb: ForgeDatabase | undefined;
let readDb: ForgeDatabase | undefined;

function createPool(connectionString: string, config: DbConfig): Pool {
  const pool = new Pool({
    connectionString,
    max: config.maxConnections ?? 10,
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? 5_000,
    // Recycle idle connections so a pooler or a failover does not leave the app holding
    // sockets the server has already forgotten about.
    idleTimeoutMillis: 30_000,
    ...(config.ssl === undefined ? {} : { ssl: config.ssl }),
  });

  /**
   * An idle client erroring is not a request failure, so it surfaces nowhere by default —
   * but node-postgres emits 'error' on the Pool, and an unhandled 'error' event takes the
   * process down. Swallowing it entirely would hide a genuinely failing database, so it is
   * logged; structured logging replaces this console call when the API wires pino.
   */
  pool.on('error', (error) => {
    console.error('[db] idle client error', error);
  });

  return pool;
}

/**
 * Idempotent. Safe to call once at boot; later calls with the same process return the
 * existing pools rather than quietly opening a second set.
 */
export function initDb(config: DbConfig): void {
  if (writePool) return;

  writePool = createPool(config.url, config);
  writeDb = drizzle(writePool, { schema });

  /**
   * Split from day one even though both URLs point at the same server today. The split is
   * free now and the alternative is auditing every call site later to decide which ones
   * are safe to route to a replica — at which point nobody remembers, so nobody moves any.
   *
   * Reads through this pool must tolerate replication lag: never read your own write back
   * through it inside the same logical operation.
   */
  const readTarget = config.readUrl ?? config.url;
  readPool = readTarget === config.url ? writePool : createPool(readTarget, config);
  readDb = readPool === writePool ? writeDb : drizzle(readPool, { schema });
}

function assertInitialised(db: ForgeDatabase | undefined): ForgeDatabase {
  if (!db) {
    throw new Error('Database not initialised. Call initDb() during application bootstrap.');
  }
  return db;
}

/** Internal. Exported only for tenant.ts — see the ESLint boundary rule. */
export const internalWriteDb = (): ForgeDatabase => assertInitialised(writeDb);
export const internalReadDb = (): ForgeDatabase => assertInitialised(readDb);

/**
 * Liveness of the connection pool, for readiness probes.
 *
 * Deliberately NOT routed through runAsSystem(): that logs an audit warning on every call
 * so unpinned access stays conspicuous, and a probe firing every few seconds would bury
 * the real signal within minutes. It is also the one query that genuinely needs no tenant
 * context — it reads nothing.
 *
 * `select 1` through the pool, rather than a TCP check, because what actually breaks is
 * the pool handing out a usable connection: exhausted slots, a failed-over primary, or
 * credentials rotated out from under a running process.
 */
export async function pingDatabase(): Promise<void> {
  const pool = writePool;
  if (!pool) throw new Error('Database not initialised');

  const client = await pool.connect();
  try {
    await client.query('select 1');
  } finally {
    client.release();
  }
}

/** Closes both pools. Called from the API's shutdown hook so deploys drain cleanly. */
export async function closeDb(): Promise<void> {
  const pools = new Set([writePool, readPool].filter((p): p is Pool => p !== undefined));
  writePool = undefined;
  readPool = undefined;
  writeDb = undefined;
  readDb = undefined;
  await Promise.all([...pools].map((pool) => pool.end()));
}

export { schema };
