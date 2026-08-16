import { z } from 'zod';

/**
 * GET /api/v1/app-config — unauthenticated, cacheable.
 *
 * The forced-upgrade mechanism, and the reason it must exist before the first store release:
 * **you cannot roll back an App Store release.** If v1.0.0 ships without a version check,
 * every user on v1.0.0 is permanently unforceable and that build's API contract has to be
 * supported indefinitely. Adding it later requires a new store release, which the users who
 * need it are by definition not installing.
 *
 * Served from Redis or a `client_releases` table rather than from config, so `minSupported`
 * can be raised WITHOUT a deploy — during an incident that difference is the whole point.
 *
 * This also doubles as the feature-flag transport, which is why a 2-person team does not
 * need a flag vendor yet.
 */

export const clientPlatform = z.enum(['ios', 'android', 'web']);
export type ClientPlatform = z.infer<typeof clientPlatform>;

export const appConfigResponse = z.object({
  /**
   * Lowest build the API will still serve. Anything below it gets 426 CLIENT_TOO_OLD on
   * every request, which is the real enforcement — the client-side check below is a
   * courtesy that produces a nicer screen.
   */
  minSupported: z.string(),
  /** Newest available, so the app can offer a non-blocking "update available" nudge. */
  latest: z.string(),
  /** Shown on the blocking screen. Server-controlled so the copy can change without a release. */
  message: z.string(),
  /** Deep link to the store listing for this platform. */
  storeUrl: z.string().url().optional(),

  /**
   * Planned downtime. Lets a migration window show a real explanation instead of the
   * generic error every failing request would otherwise produce.
   */
  maintenance: z.boolean().default(false),
  maintenanceMessage: z.string().optional(),

  /**
   * Feature flags resolved for the caller.
   *
   * Per-studio rollout is what a gym SaaS actually needs — "enable new billing for these
   * three gyms first" — and it arrives here already resolved so no client re-implements the
   * targeting rules.
   */
  flags: z.record(z.string(), z.boolean()).default({}),
});
export type AppConfigResponse = z.infer<typeof appConfigResponse>;

/**
 * Compares dotted numeric versions: "1.10.0" > "1.9.0".
 *
 * String comparison gets that backwards, which would let a NEWER build be rejected as too
 * old — a self-inflicted outage for exactly the users who did update. Shared so the client
 * and the server agree by construction rather than by two similar implementations.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string): number[] =>
    value
      .split('.')
      .map((part) => Number.parseInt(part, 10))
      // A non-numeric segment ("1.2.0-beta") reads as 0 rather than NaN, so an unexpected
      // format degrades to "older" instead of poisoning every comparison.
      .map((part) => (Number.isNaN(part) ? 0 : part));

  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i += 1) {
    // Missing segments are 0, so "1.2" and "1.2.0" compare equal.
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }

  return 0;
}

/** True when `version` is below `minSupported`. */
export function isBelowMinimum(version: string, minSupported: string): boolean {
  return compareVersions(version, minSupported) < 0;
}
