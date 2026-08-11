import { sql } from 'drizzle-orm';
import { foreignKey, index, pgTable, text, unique, uniqueIndex } from 'drizzle-orm/pg-core';

import { auditColumns, primaryKeyColumn, studioIdColumn } from './_base.js';
import { studios } from './studios.js';

/**
 * A branch. Gyms belong to a studio and are NOT tenants.
 *
 * A gym row answers "where did this happen" — which branch a check-in was recorded at,
 * which branch an invoice was raised from. It never answers "what may this person see".
 * Access is resolved once per request into `accessibleGymIds`; see resolveAccessibleGyms.
 */
export const gyms = pgTable(
  'gyms',
  {
    id: primaryKeyColumn(),
    studioId: studioIdColumn(),
    name: text('name').notNull(),
    /** Short human code shown in the app and on receipts, e.g. "ANDHERI". */
    code: text('code').notNull(),
    status: text('status').notNull().default('active'),
    ...auditColumns,
  },
  (t) => [
    foreignKey({
      columns: [t.studioId],
      foreignColumns: [studios.id],
      name: 'gyms_studio_id_fk',
    }),

    /**
     * Not redundant with the primary key, despite appearances. This is the target of the
     * COMPOSITE foreign keys on memberships and attendance:
     *
     *   FOREIGN KEY (studio_id, gym_id) REFERENCES gyms (studio_id, id)
     *
     * A plain `gym_id -> gyms(id)` reference would happily let studio A's membership
     * point at studio B's gym. The composite version makes that unrepresentable in the
     * database itself, independently of RLS and independently of application code — which
     * matters because it is the one guarantee that survives a bug in either.
     */
    unique('gyms_studio_id_id_key').on(t.studioId, t.id),

    // Every unique constraint on a tenant table leads with studio_id, or one studio's
    // branch code would block another's. Partial so a closed branch frees its code.
    uniqueIndex('gyms_studio_id_code_key')
      .on(t.studioId, t.code)
      .where(sql`${t.deletedAt} is null`),

    // Every index leads with studio_id: every query is already filtered by it, so a
    // trailing tenant column would make the index useless for tenant-scoped scans.
    index('gyms_studio_id_created_at_idx').on(t.studioId, t.createdAt),
  ],
);

export type Gym = typeof gyms.$inferSelect;
export type NewGym = typeof gyms.$inferInsert;
