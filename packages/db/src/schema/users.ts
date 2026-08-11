import { sql } from 'drizzle-orm';
import { pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

import { auditColumns, primaryKeyColumn } from './_base.js';

/**
 * GLOBAL — deliberately not tenant-scoped, and one of only two exceptions in the schema.
 *
 * A person is identified by their phone number, once, across all of Forge. That is what
 * lets a trainer work at two studios and a member belong to two chains without becoming
 * two disconnected accounts. Studio-specific facts (role, access, joining date, status)
 * live on `memberships`, never here.
 *
 * The consequence to keep in mind: this table holds PII and has no studio wall, so it is
 * reachable before any tenant context exists. That is a genuine requirement — OTP login
 * has to find a user by phone *before* it knows which studio they are signing into — but
 * it means the RLS policy here cannot be a simple studio comparison. See the migration:
 * a row is visible when the caller shares a studio with it, or when no studio context is
 * set at all (the auth path, which runs through runAsSystem and is logged every time).
 *
 * Fail direction is safe: if that policy is wrong, login breaks loudly rather than
 * leaking quietly.
 */
export const users = pgTable(
  'users',
  {
    id: primaryKeyColumn(),

    /**
     * E.164, validated by phoneSchema in @forge/shared before it ever reaches here.
     * Stored with the country code so a future non-India market does not need a backfill.
     */
    phone: text('phone').notNull(),

    fullName: text('full_name'),
    ...auditColumns,
  },
  (t) => [
    /**
     * Global uniqueness — the one unique constraint in the schema that does NOT lead with
     * studio_id, precisely because identity is global. This is what makes "same person,
     * two studios" resolve to one user row.
     *
     * Partial, so a DPDP erasure that soft-deletes an account frees the number for a
     * genuine re-registration later.
     */
    uniqueIndex('users_phone_key')
      .on(t.phone)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
