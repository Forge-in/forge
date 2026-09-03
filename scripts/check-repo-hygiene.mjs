#!/usr/bin/env node
/**
 * Repo-shape invariants that no linter, compiler or test can express.
 *
 * Every check here exists because the thing it catches is SILENT: nothing errors, nothing
 * warns, and the cost lands weeks later on someone who did not cause it. They are cheap,
 * they are read-only, and they run in the `guardrails` CI job before anything is built.
 *
 *   1. Foreign lockfiles          — an npm/yarn/bun lockfile beside pnpm's resolves a
 *                                   different tree than CI installs.
 *   2. Orphan workspace folders   — a directory under apps/ or packages/ with no manifest is
 *                                   invisible to pnpm and turbo, so its code is never built,
 *                                   linted, typechecked or tested.
 *   3. Node version alignment     — .nvmrc, root `engines.node` and every Dockerfile base
 *                                   image must agree, or production runs a Node that CI
 *                                   never tested.
 *   4. packageManager pin         — the CI setup action derives pnpm from this field alone.
 *                                   A range makes the installer non-deterministic.
 *   5. Action pinning             — a mutable tag (`@v4`) means a third party can change
 *                                   what CI executes without a reviewed diff here.
 *   6. e2e env <-> turbo          — turbo FILTERS the environment: a variable exported by
 *                                   the workflow but missing from passThroughEnv never
 *                                   reaches the process, and the symptom is a 429 in a test
 *                                   that has nothing to do with rate limiting.
 *   7. workflow env <-> turbo     — the same trap one level up, for the variables that look
 *                                   too trivial to check: a telemetry flag set in ci.yml but
 *                                   absent from globalPassThroughEnv is simply inert.
 *
 * No dependencies, so it runs in any environment, before or after install. Read-only: the
 * `guardrails` job asserts the working tree is unchanged afterwards.
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
 * laptop is how a guardrail gets deleted. Git's index is the same on every machine and in
 * CI, so what this reports is exactly what a reviewer would see in the diff.
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
// pnpm-lock.yaml is the only lockfile CI honours (`pnpm install --frozen-lockfile`). A
// package-lock.json committed next to it is not merely redundant: someone who runs `npm
// install` in that directory gets a DIFFERENT dependency tree than CI resolves, and the bug
// they then cannot reproduce is the one that reaches production.
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
        `CI installs from, so this file silently resolves a different tree for anyone who ` +
        `trusts it. Delete it.`,
    );
  }
}

if (!existsSync(join(repoRoot, 'pnpm-lock.yaml'))) {
  fail('pnpm-lock.yaml is missing — `pnpm install --frozen-lockfile` cannot run in CI.');
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
// sat in this state through several green CI runs. This makes it a failure, which is the
// only thing that gets an abandoned scaffold actually deleted.
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
//   .nvmrc                 what CI and every developer's shell install
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
      `engines.node is "${engines}" but .nvmrc pins Node ${nodeMajor}. CI installs the ` +
        `.nvmrc version, so the declared engine range is describing a runtime nobody uses.`,
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
            `would run a Node version CI never tested against.`,
        );
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 4. packageManager
//
// .github/actions/setup deliberately passes no `version:` to pnpm/action-setup — the version
// comes from this field, which is the single source of truth. Passing both broke CI twice
// (a9729bb, d1a0e3b). That only holds while the field is an EXACT pin: a range would let two
// runs of the same commit install different pnpm versions and resolve differently.
//
// A second workspace declaring the field is worse than useless — corepack reads the root
// one, so the nested value is inert while looking authoritative.
// ═══════════════════════════════════════════════════════════════════════════════════════
{
  const rootManifest = JSON.parse(readText('package.json'));
  const pm = rootManifest.packageManager;

  if (!pm) {
    fail(
      'Root package.json has no `packageManager` field. The CI setup action derives the ' +
        'pnpm version from it and passes no version of its own, so without it CI installs ' +
        'whatever pnpm the runner image happens to ship.',
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
// 5. Action pinning
//
// `uses: some/action@v4` resolves a MUTABLE tag. Whoever controls that repository can move
// it, and CI — which holds a GITHUB_TOKEN, the registry credential and the whole source
// tree — silently starts executing different code with no diff anywhere in this repo. The
// tj-actions/changed-files compromise in March 2025 was exactly this: a tag repointed at a
// commit that dumped runner memory (including secrets) into the build log, hitting some
// 23,000 repositories.
//
// A 40-character commit SHA is immutable. Dependabot updates these pins and rewrites the
// trailing version comment, so pinning costs nothing in maintenance (.github/dependabot.yml).
// ═══════════════════════════════════════════════════════════════════════════════════════
const workflowFiles = trackedFiles.filter((f) =>
  /^\.github\/(workflows|actions)\/.+\.ya?ml$/.test(f),
);

if (workflowFiles.length === 0) {
  fail('No workflow files found under .github/ — the pinning check would pass vacuously.');
}

for (const file of workflowFiles) {
  const lines = readText(file).split(/\r?\n/);

  lines.forEach((line, index) => {
    const match = line.match(/^\s*(?:-\s*)?uses:\s*(\S+)(.*)$/);
    if (!match) return;

    const [, ref, rest] = match;
    const at = `${file}:${index + 1}`;

    // A local composite action is this repository's own code, reviewed in the same PR.
    if (ref.startsWith('./')) return;

    if (ref.startsWith('docker://')) {
      if (!/@sha256:[0-9a-f]{64}$/.test(ref)) {
        fail(`${at}: \`${ref}\` uses a mutable container tag. Pin it by @sha256: digest.`);
      }
      return;
    }

    const [, version] = ref.split('@');
    if (!version) {
      fail(`${at}: \`${ref}\` has no version at all. Pin it to a full commit SHA.`);
      return;
    }

    if (!/^[0-9a-f]{40}$/.test(version)) {
      fail(
        `${at}: \`${ref}\` is pinned to the mutable ref "${version}". Third-party actions ` +
          `run with access to this repo's token and source, so they must be pinned to a ` +
          `full 40-character commit SHA.`,
      );
      return;
    }

    // The SHA is what is enforced; the comment is what makes the diff readable and is what
    // Dependabot rewrites when it bumps the pin. Without it nobody can tell v4 from v7.
    if (!/#\s*v?\d/.test(rest)) {
      fail(
        `${at}: \`${ref}\` is correctly SHA-pinned but carries no version comment. Append ` +
          `\`# v1.2.3\` so the pin is reviewable and Dependabot can keep it current.`,
      );
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 6. The e2e environment must survive turbo's env filter
//
// turbo does not pass the ambient environment through to a task. A variable set by the
// workflow but absent from `passThroughEnv` in turbo.json simply never arrives: the API
// falls back to its default, and the symptom is a 429 in a test that has nothing to do with
// rate limiting. Running jest directly hides it completely, because that path bypasses
// turbo — so the person debugging sees it pass locally and fail in CI.
//
// Keeping the workflow environment in one plain file makes the two halves comparable, which
// is the entire reason .github/ci/e2e.env exists instead of an `env:` block in ci.yml.
// ═══════════════════════════════════════════════════════════════════════════════════════

/**
 * turbo.json is JSONC — it is heavily commented, and JSON.parse rejects that.
 *
 * Written as a character scanner rather than a regex because a regex that strips `//`
 * cannot tell a comment from the `//` inside `postgresql://host`, and would corrupt the
 * document it is meant to read.
 */
function parseJsonc(source, label) {
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];

    if (inLine) {
      if (ch === '\n') {
        inLine = false;
        out += ch;
      }
      continue;
    }
    if (inBlock) {
      if (ch === '*' && next === '/') {
        inBlock = false;
        i += 1;
      } else if (ch === '\n') {
        out += ch;
      }
      continue;
    }
    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i += 1;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === '/' && next === '/') {
      inLine = true;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlock = true;
      i += 1;
      continue;
    }
    out += ch;
  }

  // Trailing commas are legal in JSONC and fatal to JSON.parse.
  try {
    return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
  } catch (error) {
    throw new Error(`${label} could not be parsed after stripping comments: ${error.message}`);
  }
}

/**
 * Variables the workflow needs but the application must never see.
 *
 * SUPERUSER_URL is the whole point of the two-role split: it is used by psql to bootstrap
 * roles and to count leftover tables after a rollback. If it ever reached the API, the
 * isolation tests would run as a superuser, pass for the wrong reason, and prove nothing.
 * Its absence from passThroughEnv is the correct state, not an oversight.
 */
const NON_APPLICATION_ENV = new Set(['SUPERUSER_URL']);

const turboConfig = parseJsonc(readText('turbo.json'), 'turbo.json');

const E2E_ENV_FILE = '.github/ci/e2e.env';

if (!existsSync(join(repoRoot, E2E_ENV_FILE))) {
  fail(
    `${E2E_ENV_FILE} is missing. The e2e job loads it into $GITHUB_ENV, and this check ` +
      `compares it against turbo.json — without it neither works.`,
  );
} else {
  const envKeys = [];

  readText(E2E_ENV_FILE)
    .split(/\r?\n/)
    .forEach((raw, index) => {
      const line = raw.trim();
      if (line === '' || line.startsWith('#')) return;

      const eq = line.indexOf('=');
      if (eq <= 0) {
        fail(
          `${E2E_ENV_FILE}:${index + 1}: "${line}" is not KEY=VALUE. The job appends this ` +
            `file to $GITHUB_ENV verbatim, which supports nothing else.`,
        );
        return;
      }

      const key = line.slice(0, eq);
      if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
        fail(`${E2E_ENV_FILE}:${index + 1}: "${key}" is not a valid environment variable name.`);
        return;
      }
      envKeys.push(key);
    });

  const duplicates = envKeys.filter((k, i) => envKeys.indexOf(k) !== i);
  for (const key of new Set(duplicates)) {
    fail(`${E2E_ENV_FILE} defines ${key} more than once; the last value silently wins.`);
  }

  const tasks = turboConfig.tasks ?? turboConfig.pipeline ?? {};

  // A key is satisfied by ANY of the tasks the e2e job runs, since both execute under the
  // same loaded environment.
  const E2E_TASKS = ['test:e2e', 'test:int'];
  const passThrough = new Set();

  for (const task of E2E_TASKS) {
    if (!tasks[task]) {
      fail(`turbo.json declares no "${task}" task, but the e2e job runs it.`);
      continue;
    }
    for (const name of tasks[task].passThroughEnv ?? []) passThrough.add(name);
    for (const name of tasks[task].env ?? []) passThrough.add(name);
  }

  for (const key of new Set(envKeys)) {
    if (NON_APPLICATION_ENV.has(key)) {
      note(`${key} is exempt from the turbo check: workflow-only, must not reach the app.`);
      continue;
    }
    if (!passThrough.has(key)) {
      fail(
        `${key} is set in ${E2E_ENV_FILE} but is not in passThroughEnv for any of ` +
          `${E2E_TASKS.join('/')} in turbo.json. turbo filters the environment, so the ` +
          `variable never reaches the process — the API falls back to its default and the ` +
          `symptom is unrelated to the variable. Add it to turbo.json, or add it to ` +
          `NON_APPLICATION_ENV here if the application must never see it.`,
      );
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 7. The workflow-level environment must survive turbo's env filter too
//
// The same trap as check 6, one level up and easier to miss, because the variables involved
// look like they could not possibly matter. ci.yml sets NEXT_TELEMETRY_DISABLED and
// EXPO_NO_TELEMETRY at the workflow level — and in turbo's strict mode (the default since
// turbo 2) neither reaches `next build` or `expo export` unless it is also listed in
// globalPassThroughEnv. The flags are then silently inert: every build phones home, and
// nothing anywhere reports that the setting did nothing.
//
// Parsed with a deliberately narrow scanner rather than a YAML library, because adding a
// dependency to a guardrail that must run before install is a worse trade. It fails loudly
// if it cannot find the block, so it can never pass vacuously.
// ═══════════════════════════════════════════════════════════════════════════════════════
{
  const CI_WORKFLOW = '.github/workflows/ci.yml';

  /**
   * Workflow variables that are consumed by the RUNNER or by turbo's own process rather
   * than by a task, so they have no business in globalPassThroughEnv.
   */
  const RUNNER_ONLY_ENV = new Set([
    // Read by the turbo CLI itself, which is the parent process — it is never filtered.
    'TURBO_TELEMETRY_DISABLED',
  ]);

  const lines = readText(CI_WORKFLOW).split(/\r?\n/);
  const start = lines.findIndex((line) => /^env:\s*$/.test(line));

  if (start === -1) {
    fail(
      `${CI_WORKFLOW} has no top-level \`env:\` block. If it was removed deliberately, ` +
        `remove this check with it — leaving it in place means it silently verifies nothing.`,
    );
  } else {
    const workflowEnv = [];

    for (let i = start + 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (line.trim() === '' || /^\s*#/.test(line)) continue;
      // Any line back at column 0 ends the block.
      if (!/^\s/.test(line)) break;

      const match = line.match(/^ {2}([A-Za-z_][A-Za-z0-9_]*):/);
      if (match) workflowEnv.push(match[1]);
    }

    if (workflowEnv.length === 0) {
      fail(`${CI_WORKFLOW}: the top-level \`env:\` block was found but parsed as empty.`);
    }

    const globalPass = new Set([
      ...(turboConfig.globalPassThroughEnv ?? []),
      ...(turboConfig.globalEnv ?? []),
    ]);

    for (const key of workflowEnv) {
      if (RUNNER_ONLY_ENV.has(key)) {
        note(`${key} is consumed by the runner or the turbo process itself, not by a task.`);
        continue;
      }
      if (!globalPass.has(key)) {
        fail(
          `${key} is set at the top level of ${CI_WORKFLOW} but is not in ` +
            `globalPassThroughEnv in turbo.json. turbo runs tasks in strict env mode, so ` +
            `the variable never reaches \`next build\`, \`expo export\` or any other task — ` +
            `the setting is inert and nothing reports it. Add it to turbo.json, or to ` +
            `RUNNER_ONLY_ENV here if it is genuinely for the runner alone.`,
        );
      }
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
  '\nOK: one lockfile, no orphan workspaces, Node versions aligned, actions SHA-pinned, ' +
    'and every CI environment variable survives turbo.',
);
