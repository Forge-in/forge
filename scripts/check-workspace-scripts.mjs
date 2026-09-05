#!/usr/bin/env node
/**
 * Guards against a silent-green test run.
 *
 * `turbo run test` only runs the task in workspaces that DECLARE it. Before this script
 * existed, five of six workspaces had no `test` script, so `pnpm test` exercised a single
 * assertion against /health and exited 0 — a green run that tested essentially nothing.
 * The tests were added; this script is what stops the hole from reopening the next time
 * someone scaffolds an app (owner-mobile is already planned).
 *
 * It also rejects placeholder scripts. A `"test": "echo ok"` is worse than no script at
 * all: turbo counts it as a passing task, so the gap becomes invisible instead of merely
 * absent.
 *
 * Exits non-zero with a per-workspace report. No dependencies, so it runs before install
 * in any environment.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Scripts every workspace must have, whatever it is. */
const REQUIRED_ALWAYS = ['lint', 'typecheck', 'test'];

/**
 * `build` is required for anything an app depends on at runtime, or anything whose only
 * real compile signal is the build. That is the case for the Next apps: `tsc --noEmit`
 * does not catch RSC boundary violations, bad "use client" placement, or invalid route
 * exports. Same for the Expo apps, whose `build` is `expo export` — the only step that
 * resolves the Metro module graph.
 */
const REQUIRED_BUILD = [
  'apps/company-admin',
  'apps/gym-owner',
  'apps/api',
  // The Expo apps for the same reason as the Next ones, and it took longest to notice here:
  // `tsc --noEmit` type-checks files, it does not RESOLVE the Metro module graph. A missing
  // asset, a require of a package that is not a dependency, a native-only module imported
  // from shared code — none of that is a type error, and none of it failed anything until
  // someone opened the app. `expo export` is the only step that walks the real graph.
  'apps/trainer-mobile',
  'apps/user-mobile',
  'packages/api-client',
  'packages/shared',
  // Emits CommonJS for the same reason as @forge/shared: the API runs as `node dist/main`
  // and cannot require TypeScript from node_modules at runtime.
  'packages/db',
];

/**
 * Config-only packages. These ship no code of their own — they are consumed as JSON/flat
 * config by other workspaces, so there is nothing to lint, typecheck, test or build.
 *
 * Adding an entry here is a deliberate, reviewable act. If you are tempted to exempt a
 * workspace that contains real source, write the test instead.
 */
const EXEMPT = {
  'packages/tsconfig': 'ships tsconfig JSON presets only — no source, nothing to execute',
  'packages/eslint-config': 'ships flat-config presets consumed by every other workspace',
  'packages/theme': 'ships theme.css and design tokens — no executable source',
};

/** A `test` script matching any of these is a placeholder pretending to be a suite. */
const PLACEHOLDER_TEST = [
  /^echo\b/,
  /^exit\s+0$/,
  /^true$/,
  /^:$/,
  /^node\s+-e\s+["']?["']?$/,
  /^$/,
];

function discoverWorkspaces() {
  const found = [];
  for (const group of ['apps', 'packages']) {
    const groupDir = join(repoRoot, group);
    if (!existsSync(groupDir)) continue;

    for (const name of readdirSync(groupDir, { withFileTypes: true })) {
      if (!name.isDirectory()) continue;

      const rel = `${group}/${name.name}`;
      const manifestPath = join(groupDir, name.name, 'package.json');

      // A directory with no package.json is invisible to pnpm and turbo, so it is not a
      // workspace. Reported separately below rather than silently ignored — a stray
      // directory holding only node_modules/.expo is usually an abandoned scaffold.
      if (!existsSync(manifestPath)) {
        found.push({ rel, orphan: true });
        continue;
      }

      found.push({
        rel,
        orphan: false,
        manifest: JSON.parse(readFileSync(manifestPath, 'utf8')),
      });
    }
  }
  return found.sort((a, b) => a.rel.localeCompare(b.rel));
}

const problems = [];
const notes = [];

for (const ws of discoverWorkspaces()) {
  if (ws.orphan) {
    notes.push(
      `${ws.rel} has no package.json — pnpm and turbo cannot see it. ` +
        `Delete it, or add a manifest if it is meant to be a workspace.`,
    );
    continue;
  }

  if (ws.rel in EXEMPT) {
    notes.push(`${ws.rel} exempt: ${EXEMPT[ws.rel]}`);
    continue;
  }

  const scripts = ws.manifest.scripts ?? {};
  const required = [...REQUIRED_ALWAYS, ...(REQUIRED_BUILD.includes(ws.rel) ? ['build'] : [])];

  for (const script of required) {
    if (typeof scripts[script] !== 'string' || scripts[script].trim() === '') {
      problems.push(
        `${ws.rel} (${ws.manifest.name}) is missing a "${script}" script. ` +
          `Without it, \`turbo run ${script}\` skips this workspace and the run is green regardless.`,
      );
    }
  }

  const testScript = scripts.test?.trim();
  if (testScript && PLACEHOLDER_TEST.some((pattern) => pattern.test(testScript))) {
    problems.push(
      `${ws.rel} (${ws.manifest.name}) has a placeholder test script: ${JSON.stringify(testScript)}. ` +
        `A no-op that turbo counts as passing is worse than no script — it hides the gap ` +
        `instead of reporting it.`,
    );
  }
}

for (const note of notes) console.log(`  note  ${note}`);

if (problems.length > 0) {
  console.error(`\n${problems.length} workspace script problem(s):\n`);
  for (const problem of problems) console.error(`  FAIL  ${problem}`);
  console.error('');
  process.exit(1);
}

console.log(
  '\nOK: every non-exempt workspace declares lint, typecheck, test (+ build where required).',
);
