import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { Pool } from 'pg';

/**
 * Applies down-migrations in reverse order and rewinds Drizzle's journal so the same
 * migrations can be re-applied.
 *
 * Drizzle has no built-in down support, which is a reasonable default — in production the
 * safe way to undo a schema change is expand/contract, so that reverting the APPLICATION
 * is always enough and the schema never moves backwards under live traffic.
 *
 * This exists so CI can PROVE reversibility on a throwaway database: up -> down -> up. The
 * PR template asks for a reversible migration; without this, that checkbox is a promise
 * nobody verifies. Writing the down file is also the moment you notice that your migration
 * drops a column and therefore cannot be reversed at all.
 *
 *   pnpm --filter @forge/db db:rollback         # everything
 *   pnpm --filter @forge/db db:rollback -- 1    # the most recent migration only
 */
async function main(): Promise<void> {
  const url = process.env.DATABASE_MIGRATION_URL;
  if (!url) {
    throw new Error('DATABASE_MIGRATION_URL is not set. It must point at forge_migrator.');
  }

  const requested = process.argv[2];
  const steps = requested ? Number(requested) : Number.POSITIVE_INFINITY;
  if (Number.isNaN(steps) || steps <= 0) {
    throw new Error(`Expected a positive number of steps to roll back, received "${requested}"`);
  }

  const downDir = join(__dirname, '..', 'migrations', 'down');
  const downFiles = readdirSync(downDir)
    .filter((name) => name.endsWith('.down.sql'))
    .sort()
    .reverse();

  const pool = new Pool({ connectionString: url, max: 1 });

  try {
    const applied = await pool.query<{ hash: string; created_at: string }>(
      `select hash, created_at from drizzle.__drizzle_migrations order by created_at desc`,
    );

    const toRollBack = downFiles.slice(0, Math.min(steps, applied.rowCount ?? 0));

    if (toRollBack.length === 0) {
      console.log('[db] nothing to roll back');
      return;
    }

    for (const [index, file] of toRollBack.entries()) {
      const statements = readFileSync(join(downDir, file), 'utf8')
        .split('--> statement-breakpoint')
        .map((statement) => statement.trim())
        .filter((statement) => statement.length > 0);

      // One transaction per migration: a half-reversed migration is worse than a failed
      // rollback, because the journal and the schema then disagree.
      const client = await pool.connect();
      try {
        await client.query('begin');
        for (const statement of statements) {
          await client.query(statement);
        }

        const entry = applied.rows[index];
        if (entry) {
          await client.query('delete from drizzle.__drizzle_migrations where hash = $1', [
            entry.hash,
          ]);
        }

        await client.query('commit');
        console.log(`[db] rolled back ${file}`);
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('[db] rollback failed');
  console.error(error);
  process.exitCode = 1;
});
