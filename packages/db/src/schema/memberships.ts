import { sql } from 'drizzle-orm';
import {
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { auditColumns, primaryKeyColumn, studioIdColumn } from './_base.js';
import { gyms } from './gyms.js';
import { studios } from './studios.js';
import { users } from './users.js';

/** What a membership is allowed to reach. Widen by adding a value, never by adding a column. */
export const GYM_ACCESS = ['all', 'restricted'] as const;
export type GymAccess = (typeof GYM_ACCESS)[number];

export const MEMBERSHIP_STATUS = ['active', 'paused', 'ended'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUS)[number];

/**
 * The join between a global person and a studio. This is where role and access live.
 *
 * Membership is STUDIO-level, so the default is an all-access chain pass: a member who
 * signed up at the Andheri branch can train at Bandra without anything special happening.
 */
export const memberships = pgTable(
  'memberships',
  {
    id: primaryKeyColumn(),
    studioId: studioIdColumn(),
    userId: uuid('user_id').notNull(),

    /** One of the four values in Role from @forge/shared. Enforced by a CHECK constraint. */
    role: text('role').notNull(),

    /**
     * Where this person signed up. ORIGIN, NOT A GATE.
     *
     * Named `registered_gym_id` rather than `home_gym_id` on purpose: "home gym" reads
     * like something you filter access by, and in six months someone would. It exists for
     * reporting (which branch acquired this member) and for invoice attribution.
     *
     * Nullable because a studio-level signup — via the web dashboard or an import — has
     * no originating branch.
     */
    registeredGymId: uuid('registered_gym_id'),

    /**
     * 'all' today, for every row. The column exists now because gym chains almost always
     * end up selling a cheap single-branch pass alongside an all-access one, and adding a
     * text column with a constant value costs nothing, while adding it later to a live
     * table with real traffic is a migration plus a backfill plus a careful deploy.
     *
     * When 'restricted' arrives it needs a membership_gym_access table. That table is NOT
     * created yet: a table that is empty for 100% of rows is dead weight, and someone will
     * eventually JOIN it and get zero rows forever. Adding it later is purely additive.
     */
    gymAccess: text('gym_access').notNull().default('all'),

    status: text('status').notNull().default('active'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .default(sql`now()`),
    endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
    ...auditColumns,
  },
  (t) => [
    foreignKey({
      columns: [t.studioId],
      foreignColumns: [studios.id],
      name: 'memberships_studio_id_fk',
    }),
    // users is global, so this one is a plain reference — there is no tenant to match.
    foreignKey({
      columns: [t.userId],
      foreignColumns: [users.id],
      name: 'memberships_user_id_fk',
    }),

    /**
     * Composite: the originating gym must belong to the SAME studio as the membership.
     * A plain gym_id reference would allow studio A to point at studio B's branch, which
     * RLS would not catch — policies filter rows, they do not validate what a row points at.
     */
    foreignKey({
      columns: [t.studioId, t.registeredGymId],
      foreignColumns: [gyms.studioId, gyms.id],
      name: 'memberships_registered_gym_fk',
    }),

    /** Target for attendance's composite FK, for the same cross-tenant reason. */
    unique('memberships_studio_id_id_key').on(t.studioId, t.id),

    /**
     * One live membership per person per role per studio. Scoped by role rather than by
     * user alone, because the same person legitimately being both a trainer and a paying
     * member of the studio they work at is a normal case, not a data error.
     */
    uniqueIndex('memberships_studio_user_role_key')
      .on(t.studioId, t.userId, t.role)
      .where(sql`${t.deletedAt} is null`),

    index('memberships_studio_id_user_id_idx').on(t.studioId, t.userId),
    index('memberships_studio_id_registered_gym_id_idx').on(t.studioId, t.registeredGymId),
    // Supports "who works here" / "who trains here" listings without a full tenant scan.
    index('memberships_studio_id_role_status_idx').on(t.studioId, t.role, t.status),
  ],
);

export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
