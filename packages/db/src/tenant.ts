import { sql } from 'drizzle-orm';

import { internalReadDb, internalWriteDb, type ForgeDatabase } from './client.js';

/**
 * The only door to the database.
 *
 * Every read and every write goes through one of these functions, and each one opens a
 * transaction and pins the tenant into it before handing over control. That single rule is
 * what makes tenant isolation enforceable rather than merely intended: there is no code
 * path that reaches Postgres without a studio pinned, so "did this query remember to
 * filter?" stops being a question anyone has to answer per query.
 */

export type TenantTransaction = Parameters<Parameters<ForgeDatabase['transaction']>[0]>[0];

/**
 * `set_config(key, value, is_local)` — the third argument is the entire safety property
 * and it is easy to miss.
 *
 * `true` scopes the setting to the CURRENT TRANSACTION. With `false` (or a bare `SET`)
 * the value persists for the life of the pooled connection, so the next request to check
 * that connection out inherits the previous request's studio. That is a cross-tenant read
 * that passes every test written against a single tenant, appears under load, and is
 * essentially invisible in review.
 *
 * It also means these must run inside a transaction: `SET LOCAL` outside one is a silent
 * no-op. Every function below opens a transaction for exactly that reason — never
 * "because the write needs atomicity".
 */
async function pinStudio(tx: TenantTransaction, studioId: string): Promise<void> {
  await tx.execute(sql`select set_config('app.studio_id', ${studioId}, true)`);
}

/** Rejects anything that is not a UUID before it reaches set_config. */
function assertStudioId(studioId: string): void {
  if (
    typeof studioId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(studioId)
  ) {
    throw new Error('withTenant requires a UUID studio id');
  }
}

/**
 * Runs `fn` with the studio pinned, on the WRITE pool, inside a transaction.
 *
 * The studio id must come from the verified JWT, never from a request body, path or query
 * parameter. Accepting it from client input would turn the whole RLS layer into an
 * elaborate way of asking the caller which tenant they would like to be.
 */
export async function withTenant<T>(
  studioId: string,
  fn: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  assertStudioId(studioId);
  return internalWriteDb().transaction(async (tx) => {
    await pinStudio(tx, studioId);
    return fn(tx);
  });
}

/**
 * Read-only equivalent, routed to the read pool.
 *
 * Still a transaction — the pin requires one — and still subject to the same policies.
 * Do not read back a row you wrote earlier in the same operation through this: once the
 * read pool points at a real replica, replication lag makes that intermittently empty.
 */
export async function withTenantRead<T>(
  studioId: string,
  fn: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  assertStudioId(studioId);
  return internalReadDb().transaction(async (tx) => {
    await pinStudio(tx, studioId);
    return fn(tx);
  });
}

/**
 * For work with no request behind it — Razorpay webhooks, scheduled jobs, admin scripts —
 * where the studio is derived from the payload rather than from a token.
 *
 * Identical to withTenant at runtime. It exists as a separate name so that "this ran
 * without an authenticated user" is visible at the call site and greppable in review,
 * instead of being indistinguishable from ordinary request handling.
 */
export async function runAs<T>(
  studioId: string,
  reason: string,
  fn: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  assertStudioId(studioId);
  return withTenant(studioId, fn).catch((error: unknown) => {
    throw new Error(`runAs(${reason}) failed for studio ${studioId}`, { cause: error });
  });
}

export interface SystemAuditLogger {
  (event: { reason: string; at: Date }): void;
}

let auditSystemAccess: SystemAuditLogger = ({ reason, at }) => {
  console.warn(`[db] runAsSystem: ${reason} at ${at.toISOString()}`);
};

/** Lets the API replace the default console warning with structured logging. */
export function setSystemAuditLogger(logger: SystemAuditLogger): void {
  auditSystemAccess = logger;
}

/**
 * Runs with NO studio pinned. Every policy sees a NULL studio and denies, so this reaches
 * only the two global tables — which is the point: OTP login has to find a user by phone
 * before it knows which studio they are signing into.
 *
 * Deliberately noisy. Every call is logged with a reason, because "no tenant context" must
 * never become the quiet default that someone reaches for when a query is inconveniently
 * filtered. If this shows up in a log for anything other than authentication or a
 * migration, that is the bug.
 */
export async function runAsSystem<T>(
  reason: string,
  fn: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  auditSystemAccess({ reason, at: new Date() });
  return internalWriteDb().transaction(async (tx) => {
    // Explicitly cleared rather than assumed absent: a pooled connection may carry a
    // value from an earlier transaction if anything ever sets it non-locally.
    await tx.execute(sql`select set_config('app.studio_id', '', true)`);
    return fn(tx);
  });
}

/**
 * `.returning()` yields `T | undefined` under noUncheckedIndexedAccess, which is correct —
 * a filtered UPDATE really can match nothing — but writing the guard at every call site
 * invites `!`, and `!` on a row that RLS filtered out is how a cross-tenant miss becomes a
 * confusing null-pointer crash three layers away instead of a clear error here.
 */
export function takeFirstOrThrow<T>(rows: readonly T[], what = 'row'): T {
  const first = rows[0];
  if (first === undefined) {
    throw new Error(`Expected exactly one ${what}, got none (row missing, or filtered by RLS)`);
  }
  return first;
}

/** Same, for genuinely optional lookups. */
export function takeFirst<T>(rows: readonly T[]): T | undefined {
  return rows[0];
}
