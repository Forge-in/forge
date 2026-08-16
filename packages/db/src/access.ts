import { and, eq, isNull, sql, type Column } from 'drizzle-orm';

import { gyms, type Membership } from './schema/index.js';
import { type TenantTransaction } from './tenant.js';

/**
 * The single place that decides which gyms a membership may reach.
 *
 * Resolved ONCE per request by an interceptor, straight after the auth guard, and stashed
 * on the request context as `accessibleGymIds`. Handlers read that value; they never call
 * this themselves and never derive access from a gym id on the membership.
 *
 * One call site is the entire design goal. When single-branch passes ship, a
 * membership_gym_access table and this one function change — nothing else, because nothing
 * else has an opinion about access.
 *
 * WHY NOT registered_gym_id: membership is sold at the STUDIO. A member who signed up at
 * Andheri can train at Bandra; `registered_gym_id` records where they joined, for
 * attribution and reporting. Filtering by it would silently convert every all-access pass
 * into a single-branch one, and would look entirely reasonable in review.
 *
 * SAFETY: this takes a live TenantTransaction rather than opening its own connection. That
 * is deliberate — it cannot be called outside withTenant(), so its query is always subject
 * to row-level security. Its result becomes the `WHERE gym_id IN (...)` of most list
 * queries in the product, so running it unpinned would make it the most dangerous function
 * in the codebase. The redundant studio_id predicate below is the second layer: if a policy
 * were ever dropped, this query still cannot cross a tenant.
 */
export async function resolveAccessibleGyms(
  tx: TenantTransaction,
  membership: Pick<Membership, 'id' | 'studioId' | 'gymAccess'>,
): Promise<string[]> {
  if (membership.gymAccess === 'all') {
    return listStudioGymIds(tx, membership.studioId);
  }

  return listRestrictedGymIds(tx, membership);
}

/** Every open branch of the studio. The path taken by 100% of memberships today. */
async function listStudioGymIds(tx: TenantTransaction, studioId: string): Promise<string[]> {
  const rows = await tx
    .select({ id: gyms.id })
    .from(gyms)
    .where(
      and(
        // Defence in depth. RLS already guarantees this, and it is repeated on purpose:
        // one bug in one policy should not be a single point of failure.
        eq(gyms.studioId, studioId),
        isNull(gyms.deletedAt),
        eq(gyms.status, 'active'),
      ),
    );

  return rows.map((row) => row.id);
}

/**
 * Placeholder for single-branch passes.
 *
 * The membership_gym_access table is deliberately NOT created yet: a table that is empty
 * for 100% of rows is dead weight, and sooner or later someone JOINs it and gets zero rows
 * forever. `gym_access` defaults to 'all' and a CHECK constraint keeps 'restricted' from
 * being written, so this branch is unreachable until the feature lands — at which point it
 * is a purely additive migration with no backfill.
 */
async function listRestrictedGymIds(
  _tx: TenantTransaction,
  membership: Pick<Membership, 'id' | 'studioId' | 'gymAccess'>,
): Promise<string[]> {
  throw new Error(
    `Membership ${membership.id} has gym_access='${membership.gymAccess}', but per-gym ` +
      'restrictions are not implemented. Create membership_gym_access and resolve from it ' +
      'here — do not fall back to registered_gym_id, which is an origin record, not a grant.',
  );
}

/**
 * Guard for handlers that accept a gym id from the client — a check-in, a branch-scoped
 * report. Membership alone does not authorise an arbitrary gym: the id still has to be one
 * this request resolved.
 *
 * Throws rather than returning false so that forgetting to check the return value cannot
 * quietly become an authorisation bypass.
 */
export function assertGymAccessible(accessibleGymIds: readonly string[], gymId: string): void {
  if (!accessibleGymIds.includes(gymId)) {
    throw new Error(`Gym ${gymId} is not accessible to this membership`);
  }
}

/**
 * SQL fragment scoping a list query to the resolved gyms.
 *
 * Takes the column rather than assuming a name: `attendance.gym_id`, `gyms.id` and any
 * future `invoices.gym_id` all need this, and a hardcoded "gym_id" would either fail
 * loudly on the wrong table or — worse, on a table that happens to have such a column for
 * another purpose — filter the wrong thing.
 */
export function accessibleGymsFilter(column: Column, accessibleGymIds: readonly string[]) {
  if (accessibleGymIds.length === 0) {
    // `IN ()` is a syntax error, and omitting the predicate would widen the query to the
    // whole studio — the exact opposite of what an empty access list means.
    return sql`false`;
  }
  return sql`${column} = any(${sql.param([...accessibleGymIds])}::uuid[])`;
}
