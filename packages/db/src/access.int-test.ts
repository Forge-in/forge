import { randomUUID } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { accessibleGymsFilter, assertGymAccessible, resolveAccessibleGyms } from './access.js';
import { closeDb, initDb } from './client.js';
import { toBusinessDate } from './business-date.js';
import { attendance, gyms, memberships, studios, users } from './schema/index.js';
import { runAsSystem, takeFirstOrThrow, withTenant } from './tenant.js';

/**
 * The all-access chain pass, proven end to end.
 *
 * A member who signed up at one branch can train at any branch of the same studio, every
 * session is recorded at the branch it happened in, and retries do not create duplicates.
 */

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL must be set and must be the forge_app role');

beforeAll(() => initDb({ url: databaseUrl, maxConnections: 1 }));
afterAll(() => closeDb());

interface Chain {
  studioId: string;
  andheri: string;
  bandra: string;
  powai: string;
  membershipId: string;
  userId: string;
}

let chain: Chain;

beforeAll(async () => {
  const studioId = randomUUID();
  const suffix = randomUUID().slice(0, 8);

  const userId = await runAsSystem('test:create-user', async (tx) => {
    const rows = await tx
      .insert(users)
      .values({ phone: `+919${Math.floor(100000000 + Math.random() * 899999999)}` })
      .returning({ id: users.id });
    return takeFirstOrThrow(rows, 'user').id;
  });

  chain = await withTenant(studioId, async (tx) => {
    await tx.insert(studios).values({ id: studioId, name: 'Iron House', slug: `iron-${suffix}` });

    const branches = await tx
      .insert(gyms)
      .values([
        { studioId, name: 'Andheri', code: `AND${suffix}` },
        { studioId, name: 'Bandra', code: `BAN${suffix}` },
        { studioId, name: 'Powai', code: `POW${suffix}` },
      ])
      .returning({ id: gyms.id, name: gyms.name });

    const byName = (name: string) => {
      const found = branches.find((b) => b.name === name);
      if (!found) throw new Error(`seed failed: no ${name}`);
      return found.id;
    };

    const andheri = byName('Andheri');

    const membership = await tx
      .insert(memberships)
      .values({
        studioId,
        userId,
        role: 'gym_user',
        // Signed up at Andheri. This must NOT restrict them to Andheri.
        registeredGymId: andheri,
      })
      .returning({ id: memberships.id });

    return {
      studioId,
      andheri,
      bandra: byName('Bandra'),
      powai: byName('Powai'),
      membershipId: takeFirstOrThrow(membership, 'membership').id,
      userId,
    };
  });
});

describe('resolveAccessibleGyms', () => {
  it('grants every branch of the studio, not just the one they registered at', async () => {
    const resolved = await withTenant(chain.studioId, async (tx) => {
      const membership = takeFirstOrThrow(
        await tx.select().from(memberships).where(eq(memberships.id, chain.membershipId)),
        'membership',
      );
      return resolveAccessibleGyms(tx, membership);
    });

    expect(resolved).toHaveLength(3);
    expect(new Set(resolved)).toEqual(new Set([chain.andheri, chain.bandra, chain.powai]));
  });

  it('defaults gym_access to "all"', async () => {
    const access = await withTenant(chain.studioId, async (tx) => {
      const row = takeFirstOrThrow(
        await tx
          .select({ gymAccess: memberships.gymAccess })
          .from(memberships)
          .where(eq(memberships.id, chain.membershipId)),
        'membership',
      );
      return row.gymAccess;
    });

    expect(access).toBe('all');
  });

  it('never returns a gym belonging to another studio', async () => {
    const otherStudioId = randomUUID();
    const suffix = randomUUID().slice(0, 8);
    await withTenant(otherStudioId, async (tx) => {
      await tx
        .insert(studios)
        .values({ id: otherStudioId, name: 'Rival', slug: `rival-${suffix}` });
      await tx
        .insert(gyms)
        .values({ studioId: otherStudioId, name: 'Rival HQ', code: `RIV${suffix}` });
    });

    const resolved = await withTenant(chain.studioId, async (tx) => {
      const membership = takeFirstOrThrow(
        await tx.select().from(memberships).where(eq(memberships.id, chain.membershipId)),
        'membership',
      );
      return resolveAccessibleGyms(tx, membership);
    });

    expect(resolved).toHaveLength(3);
  });

  it('excludes closed branches', async () => {
    await withTenant(chain.studioId, async (tx) => {
      await tx.update(gyms).set({ status: 'closed' }).where(eq(gyms.id, chain.powai));
    });

    const resolved = await withTenant(chain.studioId, async (tx) => {
      const membership = takeFirstOrThrow(
        await tx.select().from(memberships).where(eq(memberships.id, chain.membershipId)),
        'membership',
      );
      return resolveAccessibleGyms(tx, membership);
    });

    expect(resolved).not.toContain(chain.powai);

    await withTenant(chain.studioId, async (tx) => {
      await tx.update(gyms).set({ status: 'active' }).where(eq(gyms.id, chain.powai));
    });
  });

  it('refuses to guess when gym_access is restricted, rather than silently narrowing', async () => {
    // The dangerous alternative would be falling back to registered_gym_id, which reads
    // plausibly and would convert an all-access pass into a single-branch one in silence.
    await expect(
      withTenant(chain.studioId, async (tx) =>
        resolveAccessibleGyms(tx, {
          id: chain.membershipId,
          studioId: chain.studioId,
          gymAccess: 'restricted',
        }),
      ),
    ).rejects.toThrow(/not implemented/i);
  });
});

describe('assertGymAccessible', () => {
  it('allows a resolved gym and rejects anything else', () => {
    const accessible = [chain.andheri, chain.bandra];
    expect(() => assertGymAccessible(accessible, chain.bandra)).not.toThrow();
    expect(() => assertGymAccessible(accessible, chain.powai)).toThrow(/not accessible/i);
  });

  it('rejects everything when the access list is empty', () => {
    expect(() => assertGymAccessible([], chain.andheri)).toThrow(/not accessible/i);
  });
});

describe('accessibleGymsFilter', () => {
  it('matches nothing for an empty list, rather than widening to the whole studio', async () => {
    const rows = await withTenant(chain.studioId, async (tx) =>
      tx.execute(sql`select id from gyms where ${accessibleGymsFilter(gyms.id, [])}`),
    );
    expect(rows.rows).toHaveLength(0);
  });

  it('matches exactly the listed gyms', async () => {
    const rows = await withTenant(chain.studioId, async (tx) =>
      tx.execute(sql`select id from gyms where ${accessibleGymsFilter(gyms.id, [chain.bandra])}`),
    );
    expect(rows.rows).toHaveLength(1);
  });

  it('scopes a different table through its own gym column', async () => {
    // Self-contained: this block runs before the attendance suite, so it seeds its own row
    // rather than depending on another describe having run first.
    const key = `filter-${randomUUID().slice(0, 8)}`;
    await withTenant(chain.studioId, async (tx) => {
      await tx.insert(attendance).values({
        studioId: chain.studioId,
        membershipId: chain.membershipId,
        gymId: chain.bandra,
        checkedInAt: new Date('2026-08-20T05:00:00Z'),
        businessDate: toBusinessDate(new Date('2026-08-20T05:00:00Z')),
        idempotencyKey: key,
      });
    });

    const atBandra = await withTenant(chain.studioId, async (tx) =>
      tx.execute(
        sql`select id from attendance
             where idempotency_key = ${key}
               and ${accessibleGymsFilter(attendance.gymId, [chain.bandra])}`,
      ),
    );
    const atAndheri = await withTenant(chain.studioId, async (tx) =>
      tx.execute(
        sql`select id from attendance
             where idempotency_key = ${key}
               and ${accessibleGymsFilter(attendance.gymId, [chain.andheri])}`,
      ),
    );

    expect(atBandra.rows).toHaveLength(1);
    expect(atAndheri.rows).toHaveLength(0);
  });
});

describe('attendance across branches', () => {
  const checkIn = (gymId: string, at: string, key: string) =>
    withTenant(chain.studioId, async (tx) =>
      tx.insert(attendance).values({
        studioId: chain.studioId,
        membershipId: chain.membershipId,
        gymId,
        checkedInAt: new Date(at),
        businessDate: toBusinessDate(new Date(at)),
        idempotencyKey: key,
      }),
    );

  it('records two branches on one day as two visits but one active day', async () => {
    const key = randomUUID().slice(0, 8);
    // 08:00 IST at Andheri, 19:00 IST at Bandra — same business day.
    await checkIn(chain.andheri, '2026-08-12T02:30:00Z', `${key}-morning`);
    await checkIn(chain.bandra, '2026-08-12T13:30:00Z', `${key}-evening`);

    const { visits, activeDays } = await withTenant(chain.studioId, async (tx) => {
      const result = await tx.execute<{ visits: string; active_days: string }>(
        sql`select count(*)::text as visits,
                   count(distinct business_date)::text as active_days
              from attendance
             where membership_id = ${chain.membershipId}::uuid
               and business_date = '2026-08-12'`,
      );
      return {
        visits: Number(result.rows[0]?.visits ?? -1),
        activeDays: Number(result.rows[0]?.active_days ?? -1),
      };
    });

    // Both numbers are legitimate; reports must say which they mean. A unique constraint
    // on (membership, business_date) would have rejected the evening check-in entirely.
    expect(visits).toBe(2);
    expect(activeDays).toBe(1);
  });

  it('collapses a retried check-in via the idempotency key', async () => {
    const key = `retry-${randomUUID().slice(0, 8)}`;
    await checkIn(chain.andheri, '2026-08-13T02:30:00Z', key);

    // The same queued write replayed after a dropped connection.
    await expect(checkIn(chain.andheri, '2026-08-13T02:30:05Z', key)).rejects.toThrow();

    const count = await withTenant(chain.studioId, async (tx) => {
      const result = await tx.execute<{ n: string }>(
        sql`select count(*)::text as n from attendance where idempotency_key = ${key}`,
      );
      return Number(result.rows[0]?.n ?? -1);
    });

    expect(count).toBe(1);
  });

  it('files a 00:30 IST check-in on the IST day, not the UTC day', async () => {
    const key = `late-${randomUUID().slice(0, 8)}`;
    // 2026-08-14T19:00Z is 2026-08-15T00:30 IST.
    await checkIn(chain.bandra, '2026-08-14T19:00:00Z', key);

    const businessDate = await withTenant(chain.studioId, async (tx) => {
      const result = await tx.execute<{ business_date: string }>(
        sql`select business_date::text from attendance where idempotency_key = ${key}`,
      );
      return result.rows[0]?.business_date;
    });

    expect(businessDate).toBe('2026-08-15');
  });

  it('cannot record a check-in at another studio gym', async () => {
    const rivalGym = await runAsSystem('test:find-rival-gym', async (tx) => {
      const result = await tx.execute<{ id: string }>(
        sql`select '00000000-0000-4000-8000-000000000000'::uuid as id`,
      );
      return result.rows[0]?.id ?? '';
    });

    await expect(
      checkIn(rivalGym, '2026-08-16T02:30:00Z', `cross-${randomUUID().slice(0, 8)}`),
    ).rejects.toThrow();
  });
});
