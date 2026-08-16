import { sql } from 'drizzle-orm';
import {
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { auditColumns, primaryKeyColumn } from './_base.js';
import { users } from './users.js';

/**
 * GLOBAL — the second and third exceptions to the tenant rule, after `users`.
 *
 * WHY THESE TABLES HAVE TO EXIST AT ALL
 *
 * `platform_admin` was in the Role enum and in the CHECK constraint on `memberships.role`
 * from the first migration, but it was unreachable: sign-in requires at least one active
 * membership, every membership requires a non-null `studio_id`, and JwtAuthGuard defines a
 * platform admin as precisely the session whose `studioId` is NULL. A platform admin was
 * therefore unrepresentable — the role existed as a name with no way to hold it.
 *
 * Putting one in `memberships` instead would be worse than useless: it would tie the person
 * who administers the platform to one tenant's row, subject to that tenant's RLS policy, and
 * a studio that could edit its own memberships could mint itself a platform admin.
 *
 * WHY THEY ARE NOT TENANT-SCOPED
 *
 * A platform admin belongs to no studio, by definition. There is no `studio_id` that could
 * scope these rows, which is why both tables are declared `global` in
 * scripts/db/assert-tenancy.sql — a deliberate, reviewable one-line diff there rather than a
 * silent exemption here.
 *
 * WHAT REPLACES THE TENANT WALL
 *
 * A policy that is the mirror image of the usual one: these rows are visible ONLY when no
 * studio is pinned. During ordinary request handling a studio is always pinned, so both
 * tables are invisible — a bug in any tenant-scoped query cannot enumerate the platform's
 * administrators or their phone numbers. The only way in is runAsSystem(), which logs every
 * call with a reason. See migration 0005.
 */

/**
 * `suspended` rather than a `deleted_at`-only model.
 *
 * Removing an admin has to be reversible and, more importantly, has to be visible: an ops
 * team needs to see that someone's access was revoked and when. A soft-deleted row reads as
 * "was never really here", which is the wrong record of a revocation.
 */
export const PLATFORM_ADMIN_STATUS = ['active', 'suspended'] as const;
export type PlatformAdminStatus = (typeof PLATFORM_ADMIN_STATUS)[number];

export const platformAdmins = pgTable(
  'platform_admins',
  {
    id: primaryKeyColumn(),

    /**
     * Identity still lives in `users`, keyed by phone.
     *
     * A separate admin identity — its own phone column, its own uniqueness — would mean the
     * same human is two rows whenever a founder is also a member of a studio, and the two
     * could drift out of step on a DPDP erasure. One person, one `users` row, everywhere.
     */
    userId: uuid('user_id').notNull(),

    /** One of PLATFORM_ADMIN_STATUS. Enforced by a CHECK constraint in migration 0005. */
    status: text('status').notNull().default('active'),

    /**
     * Recorded rather than derived from `updated_at`, which any unrelated write moves.
     * "When did this person lose access" is a question incident review actually asks.
     */
    suspendedAt: timestamp('suspended_at', { withTimezone: true, mode: 'date' }),

    /**
     * Who let this person in. NULL only for the founding admin, which is created by the
     * seed CLI with no inviter above it.
     *
     * Deliberately NOT a foreign key, for the same reason as `auditColumns.createdBy`: the
     * provenance of an admin account must survive the deletion of whoever created it.
     */
    invitedBy: uuid('invited_by'),

    /** Powers "this account has not been used in 90 days" review, and nothing else. */
    lastSignedInAt: timestamp('last_signed_in_at', { withTimezone: true, mode: 'date' }),

    ...auditColumns,
  },
  (t) => [
    foreignKey({
      columns: [t.userId],
      foreignColumns: [users.id],
      name: 'platform_admins_user_id_fk',
    }),

    /**
     * One admin record per person. Partial, matching the convention every soft-deletable
     * table here follows: without `WHERE deleted_at IS NULL` a removed admin keeps the slot
     * and the same person can never be re-added.
     */
    uniqueIndex('platform_admins_user_id_key')
      .on(t.userId)
      .where(sql`${t.deletedAt} is null`),

    // Supports the "is there more than one active admin left?" check that guards suspension.
    index('platform_admins_status_idx').on(t.status),
  ],
);

export type PlatformAdmin = typeof platformAdmins.$inferSelect;
export type NewPlatformAdmin = typeof platformAdmins.$inferInsert;

/**
 * Pre-authorisation to become a platform admin, bound to one phone number.
 *
 * WHY A TOKEN AND NOT JUST A PRE-APPROVED NUMBER
 *
 * Sign-in is phone OTP, so possession of the SIM is the entire login factor. If adding an
 * admin were only "list this number", then a SIM swap — a live, routine attack on Indian
 * numbers — would be enough to take over an account that can see every tenant on the
 * platform. The token is a SECOND factor for the one moment that matters most, and it is
 * deliberately NOT delivered over SMS: it is shown once to the inviting admin, who passes it
 * to the new admin over some other channel. An attacker holding the SIM still cannot
 * activate.
 *
 * Accepting an invite therefore requires the token AND a code sent to the invited number, in
 * a single request. There is no intermediate half-authenticated state to attack.
 */
export const platformAdminInvites = pgTable(
  'platform_admin_invites',
  {
    id: primaryKeyColumn(),

    /**
     * E.164, validated by phoneSchema in @forge/shared before it reaches here.
     * The invite is bound to this number: the token alone cannot make a different phone an
     * admin, which is what stops an intercepted token from being a complete bypass.
     */
    phone: text('phone').notNull(),

    /**
     * SHA-256 of the token, never the token itself.
     *
     * A readable token in this column is a live credential: anyone with SELECT on this table
     * — a support query, a database dump, a backup on someone's laptop — could activate
     * themselves as a platform admin. Storing the hash means the plaintext exists exactly
     * once, in the API response that created it.
     *
     * SHA-256 rather than argon2 deliberately: the token is 256 bits of CSPRNG output, so
     * there is no dictionary to slow down and a work factor buys nothing.
     */
    tokenHash: text('token_hash').notNull(),

    /**
     * Invites expire. An indefinite pre-authorisation sitting in a table is an account
     * waiting to be created by whoever eventually finds the token in a chat history.
     */
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),

    /** Set on use. Single use is enforced by this column, not by deleting the row. */
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
    acceptedBy: uuid('accepted_by'),

    /** Set when an admin cancels an invite that has not been used. */
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    revokedBy: uuid('revoked_by'),

    /** Who issued it. Not a foreign key — see the same note on platformAdmins.invitedBy. */
    invitedBy: uuid('invited_by').notNull(),

    ...auditColumns,
  },
  (t) => [
    /**
     * The lookup on the accept path is by token hash, and it must be unique so that a
     * presented token identifies exactly one invite. Total rather than partial: a hash
     * collision across an accepted and a pending invite would be a genuine ambiguity, and
     * the accepted rows are the audit trail — they must keep their slot.
     */
    uniqueIndex('platform_admin_invites_token_hash_key').on(t.tokenHash),

    /**
     * At most one OUTSTANDING invite per number. Partial, so the same number can be
     * re-invited after an invite is used, revoked or expires — without which a person who
     * left and returned could never be re-added.
     *
     * Expiry is deliberately not part of the predicate: a partial index cannot reference
     * now(), since the expression must be immutable. Expired invites are filtered in the
     * query and cleaned up by re-invite, which revokes any outstanding row first.
     */
    uniqueIndex('platform_admin_invites_pending_phone_key')
      .on(t.phone)
      .where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null and ${t.deletedAt} is null`),

    // Supports listing outstanding invites in the console without a full scan.
    index('platform_admin_invites_expires_at_idx').on(t.expiresAt),
  ],
);

export type PlatformAdminInvite = typeof platformAdminInvites.$inferSelect;
export type NewPlatformAdminInvite = typeof platformAdminInvites.$inferInsert;
