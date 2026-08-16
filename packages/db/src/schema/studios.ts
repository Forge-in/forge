import { sql } from 'drizzle-orm';
import { index, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

import { auditColumns, primaryKeyColumn } from './_base.js';

/**
 * The tenant root. A studio is the business that buys Forge; every other tenant-scoped
 * table hangs off `studio_id` pointing here.
 *
 * This is the one tenant-scoped table WITHOUT a `studio_id` column — its own `id` is the
 * tenant key, so its RLS policy is keyed on `id` instead. assert-tenancy.sql knows about
 * that exception by name and still requires RLS, FORCE and a policy with both USING and
 * WITH CHECK.
 */
export const studios = pgTable(
  'studios',
  {
    id: primaryKeyColumn(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),

    /**
     * Drives every business-day boundary for this studio: billing dates, attendance
     * days, streaks, expiry.
     *
     * Defaulted to IST because that is the whole market today, but kept as a column
     * rather than hardcoded in the app so the "one place that converts" is parameterised
     * from the start. India has no DST, which is the only reason this is currently
     * simple — a hardcoded offset would break the day a studio opens outside it.
     */
    timezone: text('timezone').notNull().default('Asia/Kolkata'),

    status: text('status').notNull().default('active'),
    ...auditColumns,
  },
  (t) => [
    // Partial: a soft-deleted studio must not keep its slug reserved forever.
    uniqueIndex('studios_slug_key')
      .on(t.slug)
      .where(sql`${t.deletedAt} is null`),
    index('studios_created_at_idx').on(t.createdAt),
  ],
);

export type Studio = typeof studios.$inferSelect;
export type NewStudio = typeof studios.$inferInsert;
