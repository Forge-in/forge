#!/usr/bin/env node
/**
 * Asserts that every path a workspace advertises actually exists.
 *
 * This exists because `@forge/theme` shipped an `exports["./tokens"]` entry pointing at a
 * `tokens.json` that had never been created. Nothing failed at install, nothing failed at
 * lint, nothing failed in CI — the first person to write `import '@forge/theme/tokens'`
 * would have got a module-resolution error, and only then.
 *
 * Checks, per workspace:
 *   - every target in `exports` resolves on disk
 *   - every entry in `files` resolves on disk
 *   - `main`, `module`, `types` and `style` resolve on disk
 *
 * Build outputs are the one legitimate exception: `@forge/shared` points at `dist/`, which
 * does not exist until it is compiled. Those are reported as skipped unless a build has
 * run, so a genuinely missing source file is still caught while a clean checkout is not
 * flagged. Run after `pnpm build` for full coverage.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Prefixes that only exist post-build. */
const BUILD_DIRS = ['dist/', './dist/', 'build/', './build/', '.next/', './.next/'];

const isBuildArtifact = (target) => BUILD_DIRS.some((dir) => target.startsWith(dir));

/** Collects every string leaf out of an `exports` map, which may be deeply conditional. */
function collectExportTargets(node, out = []) {
  if (typeof node === 'string') {
    out.push(node);
  } else if (Array.isArray(node)) {
    for (const item of node) collectExportTargets(item, out);
  } else if (node && typeof node === 'object') {
    for (const value of Object.values(node)) collectExportTargets(value, out);
  }
  return out;
}

const problems = [];
const skipped = [];
let checked = 0;

for (const group of ['apps', 'packages']) {
  const groupDir = join(repoRoot, group);
  if (!existsSync(groupDir)) continue;

  for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const wsDir = join(groupDir, entry.name);
    const manifestPath = join(wsDir, 'package.json');
    if (!existsSync(manifestPath)) continue;

    const rel = `${group}/${entry.name}`;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

    /** @type {Array<[string, string]>} */
    const targets = [];

    for (const field of ['main', 'module', 'types', 'typings', 'style']) {
      if (typeof manifest[field] === 'string') targets.push([field, manifest[field]]);
    }
    for (const target of collectExportTargets(manifest.exports)) {
      targets.push(['exports', target]);
    }
    for (const target of manifest.files ?? []) {
      // `files` entries may be globs or directories; only plain paths are checkable.
      if (typeof target === 'string' && !/[*?[\]{}]/.test(target)) {
        targets.push(['files', target]);
      }
    }

    for (const [field, target] of targets) {
      // Bare specifiers and conditions like "node" are not paths.
      if (!target.startsWith('.') && !target.match(/^[\w.-]+([/\\]|$)/)) continue;

      const onDisk = join(wsDir, target.replace(/^\.\//, ''));

      if (isBuildArtifact(target) && !existsSync(onDisk)) {
        skipped.push(`${rel} ${field} -> ${target} (build output; run \`pnpm build\` to check)`);
        continue;
      }

      checked += 1;
      if (!existsSync(onDisk)) {
        problems.push(
          `${rel} (${manifest.name}) declares ${field} -> "${target}" but that path does not ` +
            `exist. Anything importing it fails at resolve time, not at build time.`,
        );
      }
    }
  }
}

for (const note of skipped) console.log(`  skip  ${note}`);

if (problems.length > 0) {
  console.error(`\n${problems.length} unresolvable package path(s):\n`);
  for (const problem of problems) console.error(`  FAIL  ${problem}`);
  console.error('');
  process.exit(1);
}

console.log(`\nOK: ${checked} declared package path(s) resolve on disk.`);
