#!/usr/bin/env node
/**
 * The dependency advisory gate.
 *
 * WHY THIS IS NOT JUST `pnpm audit --audit-level high`:
 *
 * A bare audit fails on every advisory the moment it is published, including the ones that
 * reach us four levels down a build-only tool and cannot affect anything we ship. A gate
 * that goes red for reasons nobody can act on is muted or ignored within a week, and then
 * the real advisory arrives and nobody looks. That is strictly worse than no gate: it
 * converts a security control into a source of noise while leaving the impression of
 * coverage.
 *
 * WHY THIS IS NOT AN IGNORE LIST EITHER:
 *
 * The usual fix — a file of advisory ids to skip — rots into a permanent mute. Nobody
 * revisits it, the justification is never written down, and two years later the file says
 * only that someone once decided not to care.
 *
 * So every entry in scripts/audit-allowlist.json must carry a REASON and an EXPIRY, and
 * this script fails on:
 *
 *   - an advisory at or above the threshold that is not in the file        (untriaged)
 *   - an entry whose expiry has passed and which still matches something   (triage expired)
 *   - an entry that matches nothing in the current audit                   (stale entry)
 *   - an entry expiring further out than MAX_TRIAGE_DAYS                   (mute in disguise)
 *   - an entry missing a reason, url, module or a parseable date           (unreviewable)
 *
 * The stale-entry rule is what keeps the file honest: once a dependency is upgraded, the
 * entry must be deleted, so the file only ever describes advisories that are live right now.
 *
 * Exit code 0 means: every advisory at or above the threshold is either absent or has a
 * written, in-date, still-relevant justification.
 *
 * Run it with `pnpm audit:ci`. Nothing runs it automatically — this repository has no CI —
 * so it is worth running before a release and whenever the lockfile moves. The expiry dates
 * in the allowlist are the only thing that will ever nag you, and only when you next run it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWLIST_PATH = join(repoRoot, 'scripts', 'audit-allowlist.json');
const ALLOWLIST_REL = 'scripts/audit-allowlist.json';

/**
 * Severities that block a merge.
 *
 * `moderate` and below are reported and not enforced — deliberately. Almost every moderate
 * in this tree is a development-time tool (a bundler dev-server, a plist parser inside the
 * Expo CLI) that never runs in production and is not reachable by an attacker. Blocking on
 * them would produce exactly the noise the gate exists to avoid. They are printed on every
 * run so the decision stays visible rather than silent.
 */
const BLOCKING = new Set(['high', 'critical']);

/**
 * The longest a triage may defer an advisory.
 *
 * An expiry is a promise to look again, not a way to say "never". Six months is long enough
 * to schedule a major dependency upgrade and short enough that no entry outlives the person
 * who wrote it.
 */
const MAX_TRIAGE_DAYS = 183;

/** Warn (do not fail) when an entry is about to come due, so it is renewed on purpose. */
const WARN_WITHIN_DAYS = 21;

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date();

/** @type {string[]} */
const problems = [];
const fail = (message) => problems.push(message);

// ═══════════════════════════════════════════════════════════════════════════════════════
// Run the audit
// ═══════════════════════════════════════════════════════════════════════════════════════

/**
 * Invoked through pnpm's own JS entry point where possible.
 *
 * `execFileSync('pnpm', ...)` cannot run pnpm.cmd on Windows without a shell, and passing
 * arguments through a shell is both a deprecation warning and an injection surface. When
 * this script is run as a pnpm script, npm_execpath already points at the JS file, so node
 * can execute it directly with no shell on any platform. The fallback covers a bare
 * `node scripts/check-advisories.mjs`.
 */
function auditCommand() {
  const execpath = process.env.npm_execpath;
  if (execpath && /\.(c?js)$/.test(execpath) && existsSync(execpath)) {
    return { command: process.execPath, args: [execpath, 'audit', '--json'], shell: false };
  }
  return {
    command: process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    args: ['audit', '--json'],
    shell: process.platform === 'win32',
  };
}

/**
 * `pnpm audit` exits non-zero WHENEVER it finds anything, so a thrown error here is the
 * normal path and the report still has to be read off the failed invocation's stdout.
 * A genuinely broken run is distinguished by stdout that does not contain a JSON object.
 */
function runAudit() {
  const { command, args, shell } = auditCommand();

  const attempt = () => {
    try {
      return execFileSync(command, args, {
        cwd: repoRoot,
        encoding: 'utf8',
        shell,
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      return error.stdout ?? '';
    }
  };

  let output = attempt();
  if (!output.includes('{')) {
    // The advisory endpoint is a network call. One transient failure should not red a build
    // that has nothing wrong with it; two in a row is a real problem worth reporting.
    console.error('audit produced no JSON on the first attempt; retrying once...');
    output = attempt();
  }

  const start = output.indexOf('{');
  if (start === -1) {
    console.error('\n`pnpm audit --json` returned no JSON report. Raw output:\n');
    console.error(output.trim() || '(empty)');
    console.error(
      '\nThis is an audit FAILURE, not a clean result — the registry advisory endpoint was ' +
        'unreachable or pnpm errored. Not treating it as "no vulnerabilities".',
    );
    process.exit(1);
  }

  try {
    return JSON.parse(output.slice(start));
  } catch (error) {
    console.error(`\nCould not parse the audit report: ${error.message}`);
    process.exit(1);
  }
}

const report = runAudit();
const advisories = Object.values(report.advisories ?? {});

// ═══════════════════════════════════════════════════════════════════════════════════════
// Load and validate the triage file
// ═══════════════════════════════════════════════════════════════════════════════════════
if (!existsSync(ALLOWLIST_PATH)) {
  console.error(`\n${ALLOWLIST_REL} is missing. An empty triage file is still required:`);
  console.error('  { "advisories": [] }\n');
  process.exit(1);
}

let allowlist;
try {
  allowlist = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
} catch (error) {
  console.error(`\n${ALLOWLIST_REL} is not valid JSON: ${error.message}\n`);
  process.exit(1);
}

const entries = allowlist.advisories ?? [];
if (!Array.isArray(entries)) {
  console.error(`\n${ALLOWLIST_REL} must have an "advisories" array.\n`);
  process.exit(1);
}

/** id -> entry, after validation. */
const triage = new Map();

entries.forEach((entry, index) => {
  const where = `${ALLOWLIST_REL} entry #${index + 1}`;

  if (typeof entry.id !== 'string' || !/^(GHSA-[\w-]+|\d+)$/.test(entry.id)) {
    fail(`${where}: "id" must be a GHSA identifier (or the numeric advisory id).`);
    return;
  }
  if (typeof entry.module !== 'string' || entry.module.trim() === '') {
    fail(
      `${where} (${entry.id}): "module" is required. Without it, an id could silently keep ` +
        `covering a different package than the one that was reviewed.`,
    );
    return;
  }
  // A one-word reason is not a triage. The length floor is crude and it works: it forces
  // the writer to state why this advisory cannot hurt us, which is the only part of the
  // entry a future reader actually needs.
  if (typeof entry.reason !== 'string' || entry.reason.trim().length < 40) {
    fail(
      `${where} (${entry.id}): "reason" must explain, in at least 40 characters, why this ` +
        `advisory is not exploitable here and what the plan is.`,
    );
    return;
  }
  if (typeof entry.url !== 'string' || !entry.url.startsWith('https://')) {
    fail(`${where} (${entry.id}): "url" must link to the advisory so it can be re-read.`);
    return;
  }
  if (typeof entry.expires !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.expires)) {
    fail(`${where} (${entry.id}): "expires" must be a YYYY-MM-DD date.`);
    return;
  }

  const expires = new Date(`${entry.expires}T23:59:59Z`);
  if (Number.isNaN(expires.getTime())) {
    fail(`${where} (${entry.id}): "expires" is not a real date.`);
    return;
  }

  const daysOut = Math.ceil((expires.getTime() - now.getTime()) / DAY_MS);
  if (daysOut > MAX_TRIAGE_DAYS) {
    fail(
      `${where} (${entry.id}): expires in ${daysOut} days, beyond the ${MAX_TRIAGE_DAYS}-day ` +
        `maximum. An expiry that far out is a permanent mute wearing a date.`,
    );
    return;
  }

  if (triage.has(entry.id)) {
    fail(`${ALLOWLIST_REL}: ${entry.id} is listed more than once.`);
    return;
  }

  triage.set(entry.id, { ...entry, expiresAt: expires, daysOut, matched: false });
});

// ═══════════════════════════════════════════════════════════════════════════════════════
// Compare
// ═══════════════════════════════════════════════════════════════════════════════════════
const blocking = [];
const informational = [];

for (const advisory of advisories) {
  const severity = String(advisory.severity ?? 'unknown').toLowerCase();
  const id = advisory.github_advisory_id ?? String(advisory.id);
  const module = advisory.module_name ?? '(unknown)';
  const paths = (advisory.findings ?? []).flatMap((f) => f.paths ?? []);

  const record = {
    id,
    severity,
    module,
    title: advisory.title ?? '',
    patched: advisory.patched_versions ?? '',
    path: paths[0] ?? '',
    pathCount: paths.length,
  };

  const entry = triage.get(id) ?? triage.get(String(advisory.id));

  if (entry) {
    entry.matched = true;

    // Guards against an entry drifting onto an advisory it was never reviewed against —
    // ids get reused in copy-paste, and the module is the cheap cross-check.
    if (entry.module !== module) {
      fail(
        `${ALLOWLIST_REL}: ${id} is triaged for "${entry.module}" but the advisory is for ` +
          `"${module}". Re-review it rather than editing the module name.`,
      );
    }

    if (entry.expiresAt.getTime() < now.getTime()) {
      fail(
        `${id} (${severity}, ${module}): the triage EXPIRED on ${entry.expires} and the ` +
          `advisory is still present. Upgrade the dependency, or re-review and set a new ` +
          `expiry with an updated reason. Reason on file: "${entry.reason}"`,
      );
    } else if (BLOCKING.has(severity) && entry.daysOut <= WARN_WITHIN_DAYS) {
      console.log(
        `::warning::advisory triage for ${id} (${module}) expires in ${entry.daysOut} day(s) ` +
          `on ${entry.expires}`,
      );
    }
    continue;
  }

  if (BLOCKING.has(severity)) {
    blocking.push(record);
  } else {
    informational.push(record);
  }
}

for (const [id, entry] of triage) {
  if (entry.matched) continue;
  fail(
    `${ALLOWLIST_REL}: ${id} (${entry.module}) no longer matches any advisory — the ` +
      `dependency was almost certainly upgraded. Delete the entry. Leaving it in place ` +
      `would pre-approve the advisory if it ever came back.`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Report
// ═══════════════════════════════════════════════════════════════════════════════════════
const counts = report.metadata?.vulnerabilities ?? {};
console.log(
  `\nScanned ${report.metadata?.totalDependencies ?? '?'} dependencies: ` +
    Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([severity, n]) => `${n} ${severity}`)
      .join(', ') || 'no advisories',
);

if (informational.length > 0) {
  console.log(
    `\n${informational.length} advisory/advisories below the ${[...BLOCKING].join('/')} ` +
      `threshold (reported, not enforced):\n`,
  );
  for (const a of informational) {
    console.log(`  ${a.severity.padEnd(9)} ${a.id}  ${a.module}  — ${a.title}`);
  }
}

// Both sections print before anything exits. Fixing an untriaged advisory only to discover
// an expired triage on the next attempt is the slow loop env.schema.ts avoids for the same
// reason: it usually happens under pressure, and each round trip is another full audit.
if (blocking.length > 0) {
  console.error(`\n${blocking.length} UNTRIAGED advisory/advisories at or above threshold:\n`);
  for (const a of blocking) {
    console.error(`  ${a.severity.toUpperCase()}  ${a.id}  ${a.module}`);
    console.error(`         ${a.title}`);
    console.error(`         fixed in: ${a.patched || '(no fix released)'}`);
    console.error(`         via: ${a.path}${a.pathCount > 1 ? ` (+${a.pathCount - 1} more)` : ''}`);
    console.error('');
  }
  console.error(
    'Fix each one by upgrading the dependency, or — if it genuinely cannot reach anything\n' +
      `we ship — add it to ${ALLOWLIST_REL} with a reason, a link and an expiry date.\n`,
  );
}

if (problems.length > 0) {
  console.error(`\n${problems.length} advisory triage problem(s):\n`);
  for (const message of problems) console.error(`  FAIL  ${message}\n`);
}

if (blocking.length > 0 || problems.length > 0) {
  process.exit(1);
}

const triaged = triage.size;
console.log(
  `\nOK: no untriaged advisories at or above the ${[...BLOCKING].join('/')} threshold` +
    (triaged > 0 ? `; ${triaged} in-date triage entr${triaged === 1 ? 'y' : 'ies'}.` : '.'),
);
