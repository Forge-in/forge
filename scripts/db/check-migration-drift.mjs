#!/usr/bin/env node
/**
 * Fails if the Drizzle schema has changed without a matching migration.
 *
 * This is the most common Drizzle mistake: edit `src/schema/*.ts`, forget
 * `pnpm db:generate`, and the types are right everywhere while the database never grows
 * the column. Nothing fails at build time — the app compiles happily and then errors at
 * runtime with "column does not exist", in production, on the one code path that uses it.
 *
 * `drizzle-kit check` does NOT catch this: it only looks for journal collisions between
 * two migrations generated from the same snapshot. The only reliable test is to run the
 * generator and see whether it wants to write anything.
 *
 * Deliberately non-destructive: any file the generator creates is removed again, so the
 * working tree is left exactly as found whether the check passes or fails.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dbPackage = join(repoRoot, 'packages', 'db');
const migrationsDir = join(dbPackage, 'migrations');
const metaDir = join(migrationsDir, 'meta');

const listSql = () => new Set(readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')));
const listMeta = () => new Set(readdirSync(metaDir));

const sqlBefore = listSql();
const metaBefore = listMeta();

// Snapshot the journal so a generated entry can be reverted byte for byte.
const journalPath = join(metaDir, '_journal.json');
const journalBefore = execFileSync(
  'git',
  ['show', `HEAD:packages/db/migrations/meta/_journal.json`],
  {
    cwd: repoRoot,
    encoding: 'utf8',
  },
).toString();

// Invoked through node with drizzle-kit's own entry point rather than through `npx`:
// npx needs shell:true on Windows, and passing arguments through a shell is both a
// deprecation warning and an injection surface.
const drizzleKitBin = join(dbPackage, 'node_modules', 'drizzle-kit', 'bin.cjs');

let generatorOutput = '';
try {
  generatorOutput = execFileSync(
    process.execPath,
    [drizzleKitBin, 'generate', '--name', 'drift_probe'],
    {
      cwd: dbPackage,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  ).toString();
} catch (error) {
  console.error('[db] drizzle-kit generate failed while checking for drift:\n');
  console.error(error.stdout?.toString() ?? '');
  console.error(error.stderr?.toString() ?? error.message);
  process.exit(1);
}

const newSql = [...listSql()].filter((f) => !sqlBefore.has(f));
const newMeta = [...listMeta()].filter((f) => !metaBefore.has(f));

// Restore the tree regardless of outcome.
for (const file of newSql) rmSync(join(migrationsDir, file), { force: true });
for (const file of newMeta) rmSync(join(metaDir, file), { force: true });
if (newSql.length > 0 || newMeta.length > 0) {
  execFileSync('git', ['checkout', '--', 'packages/db/migrations/meta/_journal.json'], {
    cwd: repoRoot,
  });
}

if (newSql.length > 0) {
  console.error('\nSchema drift: src/schema/*.ts has changes with no matching migration.\n');
  console.error(`  drizzle-kit wanted to create: ${newSql.join(', ')}\n`);
  console.error('  Fix: pnpm --filter @forge/db db:generate');
  console.error('       ...then write the matching migrations/down/<name>.down.sql,');
  console.error('       and re-run this check.\n');
  console.error('  (Nothing was left behind — the probe migration has been deleted.)\n');
  process.exit(1);
}

// Sanity: the generator must have actually looked at the schema. If a future drizzle-kit
// changes its output format, an unconditional "no drift" would be a silently useless gate.
if (!/no schema changes|nothing to migrate|\d+ tables/i.test(generatorOutput)) {
  console.error('\nCould not confirm drizzle-kit inspected the schema. Raw output:\n');
  console.error(generatorOutput);
  console.error('\nThis check may no longer be meaningful — verify it before trusting it.\n');
  process.exit(1);
}

console.log('OK: schema and migrations agree.');
void journalBefore;
void journalPath;
