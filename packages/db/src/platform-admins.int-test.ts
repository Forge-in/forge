import { randomUUID } from 'node:crypto';

import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, initDb } from './client.js';
import { platformAdminInvites, platformAdmins, studios, users } from './schema/index.js';
import { runAsSystem, takeFirstOrThrow, withTenant } from './tenant.js';

/**
 * The platform-admin tables, proven against a real database.
 *
 * These carry the inverse of the usual tenant rule — visible ONLY when no studio is pinned —
 * and that inversion is exactly the kind of thing that looks correct in a migration and is
 * wrong in practice. The structural guard (scripts/db/assert-tenancy.sql) proves a policy
 * EXISTS; only running queries proves it does the right thing.
 *
 * What is at stake if the policy is wrong in the permissive direction: the phone numbers of
 * everyone who can reach every tenant on the platform, readable from any tenant-scoped query
 * that strays. There would be no error and no symptom.
 */

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL must be set for integration tests, and must point at the forge_app role. ' +
      'Running these as a superuser or as the table owner would make every assertion pass ' +
      'for the wrong reason — FORCE ROW LEVEL SECURITY is precisely what is being tested.',
  );
}

/**
 * max: 1, for the same reason as tenancy.int-test.ts: a single physical connection means a
 * `SET` used where `SET LOCAL` was intended would leak the previous transaction's studio
 * into the next one, and these assertions would catch it. A larger pool hides that.
 */
beforeAll(() => {
  initDb({ url: databaseUrl, maxConnections: 1 });
});

afterAll(async () => {
  await closeDb();
});

const randomPhone = (): string =>
  `+919${Math.floor(100000000 + Math.random() * 899999999)}`.slice(0, 13);

/** Creates a user and makes them a platform admin, via the unpinned path auth uses. */
async function createAdmin(): Promise<{ userId: string; adminId: string; phone: string }> {
  const phone = randomPhone();

  return runAsSystem('test:create-platform-admin', async (tx) => {
    const userId = takeFirstOrThrow(
      await tx.insert(users).values({ phone }).returning({ id: users.id }),
      'user',
    ).id;

    const adminId = takeFirstOrThrow(
      await tx.insert(platformAdmins).values({ userId }).returning({ id: platformAdmins.id }),
      'admin',
    ).id;

    return { userId, adminId, phone };
  });
}

describe('the unpinned-only policy', () => {
  it('lets the auth path read an admin with no studio pinned', async () => {
    const { adminId } = await createAdmin();

    const found = await runAsSystem('test:read-admin', async (tx) =>
      tx.select().from(platformAdmins).where(eq(platformAdmins.id, adminId)),
    );

    expect(found).toHaveLength(1);
  });

  /**
   * THE ASSERTION THIS FILE EXISTS FOR.
   *
   * Ordinary request handling ALWAYS pins a studio. If a pinned transaction can see these
   * rows, then any tenant-scoped query that strays — an over-broad join, a hand-written
   * report, a bug in one handler — can enumerate the platform's administrators.
   */
  it('hides every admin row while a studio is pinned', async () => {
    const { adminId } = await createAdmin();
    const studioId = randomUUID();

    const visible = await withTenant(studioId, async (tx) => {
      await tx
        .insert(studios)
        .values({ id: studioId, name: 'Pinned', slug: `p-${studioId.slice(0, 12)}` });

      return tx.select().from(platformAdmins).where(eq(platformAdmins.id, adminId));
    });

    expect(visible).toHaveLength(0);
  });

  it('hides invites while a studio is pinned', async () => {
    const { userId } = await createAdmin();
    const phone = randomPhone();

    const inviteId = await runAsSystem(
      'test:create-invite',
      async (tx) =>
        takeFirstOrThrow(
          await tx
            .insert(platformAdminInvites)
            .values({
              phone,
              tokenHash: randomUUID(),
              expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
              invitedBy: userId,
            })
            .returning({ id: platformAdminInvites.id }),
          'invite',
        ).id,
    );

    const studioId = randomUUID();
    const visible = await withTenant(studioId, async (tx) => {
      await tx
        .insert(studios)
        .values({ id: studioId, name: 'Pinned', slug: `q-${studioId.slice(0, 12)}` });

      return tx.select().from(platformAdminInvites).where(eq(platformAdminInvites.id, inviteId));
    });

    expect(visible).toHaveLength(0);
  });

  /**
   * Reads are not the only direction. A pinned transaction must not be able to CREATE an
   * administrator either — otherwise a studio-scoped code path with an INSERT bug becomes a
   * privilege-escalation route into the platform console.
   */
  it('refuses to create an admin from a pinned transaction', async () => {
    const { userId } = await createAdmin();
    const studioId = randomUUID();

    await expect(
      withTenant(studioId, async (tx) => {
        await tx
          .insert(studios)
          .values({ id: studioId, name: 'Escalate', slug: `e-${studioId.slice(0, 12)}` });

        // A different user, so the unique index is not what rejects this.
        const otherId = takeFirstOrThrow(
          await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)),
          'user',
        ).id;

        return tx.insert(platformAdmins).values({ userId: otherId });
      }),
    ).rejects.toThrow();
  });
});

describe('constraints that keep the records honest', () => {
  /**
   * Status and timestamp cannot disagree. `suspended_at` is what an incident review reads to
   * answer "when did this account lose access"; a service bug that flips the status without
   * stamping the time produces a revocation with no date.
   */
  it('rejects a suspended admin with no suspension timestamp', async () => {
    const { adminId } = await createAdmin();

    await expect(
      runAsSystem('test:bad-suspension', async (tx) =>
        tx
          .update(platformAdmins)
          .set({ status: 'suspended' })
          .where(eq(platformAdmins.id, adminId)),
      ),
    ).rejects.toThrow();
  });

  it('rejects an active admin that still carries a suspension timestamp', async () => {
    const { adminId } = await createAdmin();

    await expect(
      runAsSystem('test:stale-suspension', async (tx) =>
        tx
          .update(platformAdmins)
          .set({ status: 'active', suspendedAt: new Date() })
          .where(eq(platformAdmins.id, adminId)),
      ),
    ).rejects.toThrow();
  });

  it('rejects a status outside the known set', async () => {
    const { adminId } = await createAdmin();

    await expect(
      runAsSystem('test:unknown-status', async (tx) =>
        tx.execute(
          sql`update platform_admins set status = 'superuser' where id = ${adminId}::uuid`,
        ),
      ),
    ).rejects.toThrow();
  });

  /**
   * At most one OUTSTANDING invite per number. Without the partial unique index, re-inviting
   * would leave two live tokens for the same phone and revoking "the" invite would leave the
   * other one working.
   */
  it('allows only one outstanding invite per phone', async () => {
    const { userId } = await createAdmin();
    const phone = randomPhone();
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    await runAsSystem('test:first-invite', async (tx) =>
      tx
        .insert(platformAdminInvites)
        .values({ phone, tokenHash: randomUUID(), expiresAt, invitedBy: userId }),
    );

    await expect(
      runAsSystem('test:duplicate-invite', async (tx) =>
        tx
          .insert(platformAdminInvites)
          .values({ phone, tokenHash: randomUUID(), expiresAt, invitedBy: userId }),
      ),
    ).rejects.toThrow();
  });

  /** ...but the same number can be invited again once the previous invite is spent. */
  it('allows a re-invite after the previous one is revoked', async () => {
    const { userId } = await createAdmin();
    const phone = randomPhone();
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    await runAsSystem('test:invite-then-revoke', async (tx) => {
      await tx
        .insert(platformAdminInvites)
        .values({ phone, tokenHash: randomUUID(), expiresAt, invitedBy: userId });

      await tx
        .update(platformAdminInvites)
        .set({ revokedAt: new Date(), revokedBy: userId })
        .where(
          and(eq(platformAdminInvites.phone, phone), eq(platformAdminInvites.invitedBy, userId)),
        );
    });

    const reinvited = await runAsSystem('test:re-invite', async (tx) =>
      tx
        .insert(platformAdminInvites)
        .values({ phone, tokenHash: randomUUID(), expiresAt, invitedBy: userId })
        .returning({ id: platformAdminInvites.id }),
    );

    expect(reinvited).toHaveLength(1);
  });

  it('rejects an invite that expires before it was created', async () => {
    const { userId } = await createAdmin();

    await expect(
      runAsSystem('test:already-expired-invite', async (tx) =>
        tx.insert(platformAdminInvites).values({
          phone: randomPhone(),
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() - 60_000),
          invitedBy: userId,
        }),
      ),
    ).rejects.toThrow();
  });

  /**
   * An invite cannot be both accepted and revoked. A revoke racing an accept would otherwise
   * leave a row that reads as both, and "is this invite still usable?" would have no single
   * answer.
   */
  it('rejects an invite marked both accepted and revoked', async () => {
    const { userId } = await createAdmin();
    const phone = randomPhone();

    await expect(
      runAsSystem('test:contradictory-invite', async (tx) =>
        tx.insert(platformAdminInvites).values({
          phone,
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 60_000),
          invitedBy: userId,
          acceptedAt: new Date(),
          acceptedBy: userId,
          revokedAt: new Date(),
          revokedBy: userId,
        }),
      ),
    ).rejects.toThrow();
  });
});
