#!/usr/bin/env node
/**
 * Repo-shape invariants that no linter, compiler or test can express.
 *
 * Every check here exists because the thing it catches is SILENT: nothing errors, nothing
 * warns, and the cost lands weeks later on someone who did not cause it.
 *
 *   1. Foreign lockfiles          — an npm/yarn/bun lockfile beside pnpm's resolves a
 *                                   different dependency tree for whoever trusts it.
 *   2. Orphan workspace folders   — a directory under apps/ or packages/ with no manifest is
 *                                   invisible to pnpm and turbo, so its code is never built,
 *                                   linted, typechecked or tested.
 *   3. Node version alignment     — .nvmrc, root `engines.node` and every Dockerfile base
 *                                   image must agree, or production runs a Node nobody
 *                                   developed or tested against.
 *   4. packageManager pin         — corepack derives pnpm from this field alone. A range
 *                                   makes the installed pnpm, and the resolved tree with it,
 *                                   non-deterministic.
 *
 * Run it with `pnpm hygiene`. NOTHING RUNS IT FOR YOU — this repository has no CI — so it is
 * worth running before a release and after anything that moves the repo's shape: a new
 * workspace, a Node bump, a scaffold you abandoned.
 *
 * Three further checks lived here until CI was removed: GitHub Actions SHA pinning, and two
 * that compared the CI environment files against turbo's passThroughEnv. All three policed
 * files that no longer exist. They are recoverable from git history if CI ever comes back —
 * restore the turbo ones first, because that trap (a variable set but not passed through, so
 * the process silently falls back to a default) is the one that cost the most time.
 *
 * No dependencies, so it runs in any environment, before or after install, and it is
 * strictly read-only.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @type {string[]} */
const problems = [];
/** @type {string[]} */
const notes = [];

const fail = (message) => problems.push(message);
const note = (message) => notes.push(message);

const readText = (relative) => readFileSync(join(repoRoot, relative), 'utf8');

/**
 * Tracked files only.
 *
 * Using the filesystem instead would make this script fail on any machine that happens to
 * have a stale `.next/` or `node_modules/` lying around — a false positive on someone's
 * laptop is how a guardrail gets deleted. Git's index is the same on every machine, so what
 * this reports is exactly what a reviewer would see in the diff.
 */
const trackedFiles = execFileSync('git', ['ls-files', '-z'], {
  cwd: repoRoot,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})
  .split('\0')
  .filter(Boolean);

// ═══════════════════════════════════════════════════════════════════════════════════════
// 1. Foreign lockfiles
//
// pnpm-lock.yaml is the only lockfile this repo resolves from. A package-lock.json committed
// next to it is not merely redundant: someone who runs `npm install` in that directory gets a
// DIFFERENT dependency tree from everyone else, and the bug nobody else can reproduce is the
// one that reaches production.
//
// This is not hypothetical here — apps/admin carried a committed package-lock.json from an
// abandoned scaffold.
// ═══════════════════════════════════════════════════════════════════════════════════════
const FOREIGN_LOCKFILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'bun.lockb',
  'bun.lock',
];

for (const file of trackedFiles) {
  const base = file.split('/').pop();
  if (FOREIGN_LOCKFILES.includes(base)) {
    fail(
      `${file} is a lockfile for another package manager. pnpm-lock.yaml is the only one ` +
        `this repo installs from, so this file silently resolves a different tree for ` +
        `anyone who trusts it. Delete it.`,
    );
  }
}

if (!existsSync(join(repoRoot, 'pnpm-lock.yaml'))) {
  fail('pnpm-lock.yaml is missing — `pnpm install --frozen-lockfile` cannot resolve.');
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 2. Orphan workspace directories
//
// pnpm-workspace.yaml globs apps/* and packages/*, but a directory without a package.json
// is not a workspace — pnpm and turbo cannot see it at all. Any source inside it is never
// linted, typechecked, tested or built, and `check-workspace-scripts.mjs` cannot report on
// it either because it has no manifest to inspect.
//
// That script already prints a note. A note is not enough: apps/admin and apps/owner-web
// sat in this state through several green runs before anyone noticed. This makes it a
// failure, which is the only thing that gets an abandoned scaffold actually deleted.
// ═══════════════════════════════════════════════════════════════════════════════════════
const workspaceDirs = new Map(); // "apps/foo" -> string[] of tracked files

for (const file of trackedFiles) {
  const parts = file.split('/');
  if (parts.length < 3) continue;
  if (parts[0] !== 'apps' && parts[0] !== 'packages') continue;

  const dir = `${parts[0]}/${parts[1]}`;
  if (!workspaceDirs.has(dir)) workspaceDirs.set(dir, []);
  workspaceDirs.get(dir).push(file);
}

for (const [dir, files] of [...workspaceDirs].sort()) {
  if (existsSync(join(repoRoot, dir, 'package.json'))) continue;

  fail(
    `${dir} has ${files.length} tracked file(s) but no package.json, so pnpm and turbo ` +
      `cannot see it: nothing in it is linted, typechecked, tested or built. Delete the ` +
      `directory, or add a manifest if it is meant to be a workspace. Tracked: ` +
      files.slice(0, 5).join(', ') +
      (files.length > 5 ? `, +${files.length - 5} more` : ''),
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 3. Node version alignment
//
// Three places name a Node version and nothing keeps them together:
//   .nvmrc                 what every developer's shell installs
//   engines.node           what pnpm warns about
//   Dockerfile `FROM node` what production actually executes
//
// Bump .nvmrc, forget the Dockerfile, and the image runs a Node that no test ever touched.
// The failure is not a build error — it is a subtle runtime difference discovered in prod.
// ═══════════════════════════════════════════════════════════════════════════════════════
const nvmrc = readText('.nvmrc').trim();
const nodeMajor = nvmrc.replace(/^v/, '').split('.')[0];

if (!/^\d+$/.test(nodeMajor)) {
  fail(`.nvmrc does not start with a numeric major version (got ${JSON.stringify(nvmrc)}).`);
} else {
  const rootManifest = JSON.parse(readText('package.json'));
  const engines = rootManifest.engines?.node;

  if (!engines) {
    fail('Root package.json declares no engines.node, so nothing pins the runtime for pnpm.');
  } else if (!engines.includes(nodeMajor)) {
    fail(
      `engines.node is "${engines}" but .nvmrc pins Node ${nodeMajor}. The .nvmrc version ` +
        `is what actually gets installed, so the declared engine range describes a runtime ` +
        `nobody uses.`,
    );
  }

  // Every Dockerfile in the repo, not just the API's — the check must keep working when a
  // second service gets one.
  for (const file of trackedFiles.filter((f) => f.split('/').pop().startsWith('Dockerfile'))) {
    const content = readText(file);
    const bases = [...content.matchAll(/^FROM\s+node:(\S+)/gim)].map((m) => m[1]);

    if (bases.length === 0) {
      note(`${file} has no \`FROM node:\` stage — Node version check does not apply.`);
      continue;
    }

    for (const base of bases) {
      const baseMajor = base.split(/[.-]/)[0];
      if (baseMajor !== nodeMajor) {
        fail(
          `${file} builds on \`node:${base}\` but .nvmrc pins Node ${nodeMajor}. The image ` +
            `would run a Node version nobody develops or tests against.`,
        );
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 4. packageManager
//
// corepack reads this field to decide which pnpm to run, and it is the only place that
// decides. That is only useful while the field is an EXACT pin: a range lets two machines, or
// the same machine a month apart, install different pnpm versions from the same commit and
// resolve the tree differently.
//
// Naming a version in two places is what broke this before (a9729bb, d1a0e3b), which is why
// there is one source of truth rather than a second copy somewhere convenient.
//
// A second workspace declaring the field is worse than useless — corepack reads the root
// one, so the nested value is inert while looking authoritative.
// ═══════════════════════════════════════════════════════════════════════════════════════
{
  const rootManifest = JSON.parse(readText('package.json'));
  const pm = rootManifest.packageManager;

  if (!pm) {
    fail(
      'Root package.json has no `packageManager` field. corepack derives the pnpm version ' +
        'from it, so without it every machine installs whatever pnpm it happens to have.',
    );
  } else if (!/^pnpm@\d+\.\d+\.\d+(\+sha\S+)?$/.test(pm)) {
    fail(
      `packageManager is "${pm}". It must be an exact pnpm pin such as "pnpm@9.15.9" — a ` +
        `range makes the installed pnpm, and therefore the resolved tree, non-deterministic.`,
    );
  }

  for (const dir of [...workspaceDirs.keys()].sort()) {
    const manifestPath = join(repoRoot, dir, 'package.json');
    if (!existsSync(manifestPath)) continue;

    if (JSON.parse(readFileSync(manifestPath, 'utf8')).packageManager) {
      fail(
        `${dir}/package.json declares \`packageManager\`. Only the root may: corepack reads ` +
          `the root manifest, so this value is inert while looking authoritative.`,
      );
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Report
// ═══════════════════════════════════════════════════════════════════════════════════════
for (const message of notes) console.log(`  note  ${message}`);

if (problems.length > 0) {
  console.error(`\n${problems.length} repo hygiene problem(s):\n`);
  for (const message of problems) console.error(`  FAIL  ${message}\n`);
  process.exit(1);
}

console.log(
  '\nOK: one lockfile, no orphan workspaces, Node versions aligned, pnpm pinned exactly.',
);
