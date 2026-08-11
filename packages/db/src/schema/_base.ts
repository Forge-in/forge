import { sql } from 'drizzle-orm';
import { date, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Column conventions every table in this schema follows.
 *
 * The tenant is the STUDIO, not the gym. A studio is the business that buys Forge; gyms
 * are its branches. A member of a 3-branch chain is one membership at the studio, not
 * three — so `studio_id` is the column that scopes data and `gym_id`, where it appears,
 * records *where an activity happened*, never *what someone may see*.
 *
 * Getting that backwards is the single easiest way to reintroduce the bug this design
 * exists to prevent, so: if you are about to filter a query by `gym_id` for access
 * control, stop — access comes from `accessibleGymIds` on the request context.
 */

/** The Postgres session variable RLS policies read. Set only by withTenant(). */
export const STUDIO_GUC = 'app.studio_id';

/**
 * `current_setting(..., true)` — the `true` means "missing_ok", returning NULL instead of
 * erroring when unset. Policies must therefore treat NULL as "deny", never as "allow".
 */
export const currentStudioSql = sql`nullif(current_setting('app.studio_id', true), '')::uuid`;

/** Primary key shared by every table. */
export const primaryKeyColumn = () =>
  uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`);

/**
 * Audit columns. `created_by`/`updated_by` are populated from the request context rather
 * than trusted from the client. They are deliberately NOT foreign keys to users: an audit
 * trail must survive the deletion of the actor it refers to.
 */
export const auditColumns = {
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .default(sql`now()`),
  /**
   * Soft delete. Default for anything a studio owner can delete and later regret.
   * Hard delete is reserved for DPDP erasure requests.
   *
   * Every unique index on a soft-deletable table must be partial — `WHERE deleted_at IS
   * NULL` — or a deleted row keeps its slot and blocks the name/phone being reused.
   */
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
};

/**
 * The tenant key. Present on every table except the explicit global allowlist in
 * scripts/db/assert-tenancy.sql, which fails CI if a new table omits it.
 *
 * Note there is no `.references()` here — the FK is declared per table as a COMPOSITE key
 * so that child rows cannot point at a parent in a different studio. See gyms.ts.
 */
export const studioIdColumn = () => uuid('studio_id').notNull();

/**
 * A business day in the studio's local timezone, stored as a plain date.
 *
 * Stored rather than derived because the derivation is timezone-dependent and must happen
 * in exactly one place. A 00:30 IST check-in belongs to the *previous* UTC day: computing
 * this per-query, per-app, would silently corrupt every daily metric the moment one
 * caller forgot the conversion. See toBusinessDate() in src/business-date.ts.
 */
export const businessDateColumn = () => date('business_date', { mode: 'string' }).notNull();
