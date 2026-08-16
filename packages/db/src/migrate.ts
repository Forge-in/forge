import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { join } from 'node:path';

/**
 * Applies pending migrations as forge_migrator.
 *
 * Run as a SEPARATE RELEASE STEP, before the new application version boots — never from
 * the API's bootstrap. Two reasons, both of which bite in production rather than locally:
 *
 *   - Two instances starting at once would race each other through the same DDL.
 *   - Boot-time migration would have to run as the runtime role, which by design cannot
 *     create or alter tables. Making it able to would hand schema rewrite privileges to
 *     the process most exposed to the internet.
 *
 * Drizzle takes an advisory lock for the duration, so a concurrent release step waits
 * rather than corrupting the journal. That is a backstop, not a licence to run two.
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_MIGRATION_URL;

  if (!url) {
    throw new Error(
      'DATABASE_MIGRATION_URL is not set. It must point at forge_migrator — DATABASE_URL ' +
        '(forge_app) has no DDL privileges by design.',
    );
  }

  // Resolved relative to this file so it works identically from src/ under tsx and from
  // dist/ in a container, where the process cwd is not something to rely on.
  // __dirname rather than import.meta.url: this package emits CommonJS so that the API,
  // which runs as `node dist/main`, can require it at runtime.
  const migrationsFolder = join(__dirname, '..', 'migrations');

  const pool = new Pool({ connectionString: url, max: 1 });

  try {
    const db = drizzle(pool);
    console.log(`[db] applying migrations from ${migrationsFolder}`);
    await migrate(db, { migrationsFolder });
    console.log('[db] migrations up to date');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('[db] migration failed');
  console.error(error);
  process.exitCode = 1;
});
