import { defineConfig } from 'drizzle-kit';

/**
 * Generation and migration run as forge_migrator, never as the runtime role.
 *
 * forge_app owns nothing and cannot create tables, which is deliberate: it means a SQL
 * injection or a compromised process cannot rewrite the schema or drop a policy. Keeping
 * the two URLs separate is what makes that real rather than aspirational.
 */
/**
 * Only `generate` and `check` use this file, and neither connects to a database — they
 * diff the schema against the snapshots in migrations/meta. The placeholder therefore lets
 * the drift check run in CI with no database at all.
 *
 * Migrations are applied by src/migrate.ts, which requires the real URL and says so
 * clearly, so an unset variable can never silently produce a no-op migration run.
 */
const url = process.env.DATABASE_MIGRATION_URL ?? 'postgresql://drizzle-kit-does-not-connect';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: { url },
  // Emit plain reviewable SQL. The security-critical DDL in this schema — FORCE ROW LEVEL
  // SECURITY, the policies, the grants — is hand-authored, so the generated files must be
  // readable next to it rather than opaque.
  verbose: true,
  strict: true,
});
