import { defineConfig } from 'drizzle-kit';

/**
 * Generation and migration run as forge_migrator, never as the runtime role.
 *
 * forge_app owns nothing and cannot create tables, which is deliberate: it means a SQL
 * injection or a compromised process cannot rewrite the schema or drop a policy. Keeping
 * the two URLs separate is what makes that real rather than aspirational.
 */
const url = process.env.DATABASE_MIGRATION_URL;

if (!url) {
  throw new Error(
    'DATABASE_MIGRATION_URL is not set. It must point at the forge_migrator role — ' +
      'DATABASE_URL (forge_app) cannot create or alter tables by design.',
  );
}

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
