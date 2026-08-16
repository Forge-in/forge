import { foreignKey, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { auditColumns, businessDateColumn, primaryKeyColumn, studioIdColumn } from './_base.js';
import { gyms } from './gyms.js';
import { memberships } from './memberships.js';
import { studios } from './studios.js';

/**
 * A check-in. Recorded at the GYM a person actually walked into, while the membership
 * that permitted it lives at the STUDIO.
 *
 * Every session is stored — morning cardio and evening weights at the same branch are two
 * rows. Collapsing to one-row-per-day is derivable from this (COUNT DISTINCT
 * business_date); the reverse is not, so questions like "what are our peak hours" or
 * "what is the average gap between sessions" would lose their data forever.
 *
 * The direct consequence: "attendance" is two different numbers and reports must say
 * which they mean.
 *
 *   COUNT(*)                       -> visits        (2 for a two-branch day)
 *   COUNT(DISTINCT business_date)  -> active days   (1 for the same day)
 *
 * This is also why there is deliberately NO unique constraint on
 * (studio_id, membership_id, business_date): it would reject the evening check-in at a
 * second branch, which is exactly the behaviour the all-access pass is meant to allow.
 * Duplicate suppression is the idempotency key's job, below — not the date's.
 */
export const attendance = pgTable(
  'attendance',
  {
    id: primaryKeyColumn(),
    studioId: studioIdColumn(),
    membershipId: uuid('membership_id').notNull(),

    /** Where the check-in physically happened. Reporting dimension, not an access check. */
    gymId: uuid('gym_id').notNull(),

    checkedInAt: timestamp('checked_in_at', { withTimezone: true, mode: 'date' }).notNull(),

    /**
     * Derived from checked_in_at in the studio's timezone, by toBusinessDate(), in exactly
     * one place. A 00:30 IST check-in belongs to the PREVIOUS UTC day — deriving this per
     * query would quietly shift every late-night visit into the wrong day and corrupt
     * daily counts for precisely the gyms that stay open late.
     */
    businessDate: businessDateColumn(),

    /**
     * Client-generated, stable across retries. Gym floors have poor signal and the app
     * queues writes, so the same check-in arrives more than once as a matter of routine —
     * not as an error case.
     */
    idempotencyKey: text('idempotency_key').notNull(),
    ...auditColumns,
  },
  (t) => [
    foreignKey({
      columns: [t.studioId],
      foreignColumns: [studios.id],
      name: 'attendance_studio_id_fk',
    }),
    foreignKey({
      columns: [t.studioId, t.membershipId],
      foreignColumns: [memberships.studioId, memberships.id],
      name: 'attendance_membership_fk',
    }),
    foreignKey({
      columns: [t.studioId, t.gymId],
      foreignColumns: [gyms.studioId, gyms.id],
      name: 'attendance_gym_fk',
    }),

    /**
     * The real duplicate guard. Not partial on deleted_at: a retry must collide with a
     * soft-deleted (reversed) check-in too, otherwise cancelling one and replaying the
     * queued request silently recreates it.
     */
    unique('attendance_studio_id_idempotency_key').on(t.studioId, t.idempotencyKey),

    /** A member's own history, and streak calculations. */
    index('attendance_studio_membership_date_idx').on(t.studioId, t.membershipId, t.businessDate),
    /** A branch manager's daily footfall report. */
    index('attendance_studio_gym_date_idx').on(t.studioId, t.gymId, t.businessDate),
  ],
);

export type Attendance = typeof attendance.$inferSelect;
export type NewAttendance = typeof attendance.$inferInsert;
