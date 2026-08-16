import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, initDb } from './client.js';
import { gyms, memberships, studios, users } from './schema/index.js';
import { runAsSystem, takeFirstOrThrow, withTenant, type TenantTransaction } from './tenant.js';

/**
 * Tenant isolation, proven against a real database.
 *
 * Every test here corresponds to a specific way multi-tenant systems leak. They are
 * written as attacks rather than as feature checks: each one performs the thing that
 * MUST NOT work and asserts that it did not.
 */

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL must be set for integration tests, and must point at the forge_app role. ' +
      'Running these as a superuser or as the table owner would make every assertion pass ' +
      'for the wrong reason.',
  );
}

/**
 * max: 1 is the point, not a resource saving.
 *
 * With a single physical connection, every sequential withTenant() call reuses the same
 * backend — so if the studio were pinned with `SET` instead of `SET LOCAL`, the second
 * transaction would inherit the first's tenant and these tests would catch it. A larger
 * pool would hand out fresh connections and hide exactly that bug.
 */
beforeAll(() => {
  initDb({ url: databaseUrl, maxConnections: 1 });
});

afterAll(async () => {
  await closeDb();
});

interface Fixture {
  studioId: string;
  gymId: string;
  userId: string;
  membershipId: string;
}

/** Creates a self-contained studio with one gym, one user and one membership. */
async function createStudio(label: string): Promise<Fixture> {
  const studioId = randomUUID();
  const suffix = randomUUID().slice(0, 8);

  // The user row is global, so it is created with no tenant pinned — the same path
  // registration uses, before the person belongs to any studio.
  const userId = await runAsSystem(`test:create-user:${label}`, async (tx) => {
    const rows = await tx
      .insert(users)
      .values({
        phone: `+919${Math.floor(100000000 + Math.random() * 899999999)}`,
        fullName: label,
      })
      .returning({ id: users.id });
    return takeFirstOrThrow(rows, 'user').id;
  });

  return withTenant(studioId, async (tx) => {
    // Note the id is supplied rather than defaulted: the studios policy is keyed on `id`,
    // so the row must carry the id that is already pinned or WITH CHECK rejects it.
    await tx.insert(studios).values({ id: studioId, name: label, slug: `${label}-${suffix}` });

    const gymRows = await tx
      .insert(gyms)
      .values({ studioId, name: `${label} branch`, code: `C${suffix}` })
      .returning({ id: gyms.id });
    const gymId = takeFirstOrThrow(gymRows, 'gym').id;

    const membershipRows = await tx
      .insert(memberships)
      .values({ studioId, userId, role: 'gym_user', registeredGymId: gymId })
      .returning({ id: memberships.id });

    return {
      studioId,
      gymId,
      userId,
      membershipId: takeFirstOrThrow(membershipRows, 'membership').id,
    };
  });
}

/**
 * Drizzle wraps driver failures in a DrizzleQueryError whose message is only "Failed
 * query: ...", so matching on the message would silently pass for ANY failure — including
 * a typo in the SQL. Walking to the driver error and asserting its SQLSTATE is the
 * difference between "the insert failed" and "the insert was refused by a security policy".
 */
function sqlStateOf(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** 42501 insufficient_privilege — what a row-level security refusal reports. */
const RLS_VIOLATION = '42501';
/** 23503 foreign_key_violation. */
const FK_VIOLATION = '23503';

async function expectRejectionCode(promise: Promise<unknown>, expected: string): Promise<void> {
  let thrown: unknown;
  try {
    await promise;
  } catch (error) {
    thrown = error;
  }

  expect(thrown, 'expected the operation to be refused, but it succeeded').toBeDefined();
  expect(sqlStateOf(thrown)).toBe(expected);
}

let alpha: Fixture;
let beta: Fixture;

beforeAll(async () => {
  alpha = await createStudio('alpha');
  beta = await createStudio('beta');
});

const countGyms = async (tx: TenantTransaction): Promise<number> => {
  const result = await tx.execute<{ n: string }>(sql`select count(*)::text as n from gyms`);
  return Number(result.rows[0]?.n ?? '-1');
};

describe('SELECT isolation', () => {
  it('shows a studio only its own gyms, though both exist', async () => {
    const seenByAlpha = await withTenant(alpha.studioId, countGyms);
    const seenByBeta = await withTenant(beta.studioId, countGyms);

    expect(seenByAlpha).toBe(1);
    expect(seenByBeta).toBe(1);

    // Both rows really are in the table — this is a policy filtering them, not an empty DB.
    const total = await runAsSystem('test:count-all-gyms', async (tx) => {
      const result = await tx.execute<{ n: string }>(
        sql`select count(*)::text as n from gyms where studio_id in (${alpha.studioId}::uuid, ${beta.studioId}::uuid)`,
      );
      // Global-table access only: gyms is tenant-scoped, so with no studio pinned this
      // must come back as zero even though the rows exist.
      return Number(result.rows[0]?.n ?? '-1');
    });
    expect(total).toBe(0);
  });

  it('cannot reach another studio by naming its id explicitly', async () => {
    const rows = await withTenant(alpha.studioId, async (tx) =>
      tx.execute(sql`select id from gyms where studio_id = ${beta.studioId}::uuid`),
    );
    expect(rows.rows).toHaveLength(0);
  });

  /**
   * The connection-reuse test. On a pool of one, these two transactions run on the same
   * backend. If the tenant were pinned with SET rather than SET LOCAL, the second call
   * would still be scoped to alpha and would see alpha's gym instead of beta's.
   */
  it('does not leak tenant context between transactions on the same connection', async () => {
    const alphaGym = await withTenant(alpha.studioId, async (tx) => {
      const result = await tx.execute<{ id: string }>(sql`select id from gyms`);
      return result.rows[0]?.id;
    });

    const betaGym = await withTenant(beta.studioId, async (tx) => {
      const result = await tx.execute<{ id: string }>(sql`select id from gyms`);
      return result.rows[0]?.id;
    });

    expect(alphaGym).toBe(alpha.gymId);
    expect(betaGym).toBe(beta.gymId);
    expect(alphaGym).not.toBe(betaGym);
  });

  it('leaves no tenant setting behind after a transaction ends', async () => {
    await withTenant(alpha.studioId, async (tx) => {
      await tx.execute(sql`select 1`);
    });

    const leaked = await runAsSystem('test:read-leftover-guc', async (tx) => {
      const result = await tx.execute<{ studio: string | null }>(
        sql`select nullif(current_setting('app.studio_id', true), '') as studio`,
      );
      return result.rows[0]?.studio ?? null;
    });

    expect(leaked).toBeNull();
  });
});

describe('write isolation', () => {
  it('updates zero rows when targeting another studio', async () => {
    const affected = await withTenant(alpha.studioId, async (tx) => {
      const result = await tx.execute(
        sql`update gyms set name = 'hijacked' where id = ${beta.gymId}::uuid`,
      );
      return result.rowCount;
    });

    expect(affected).toBe(0);

    const betaName = await withTenant(beta.studioId, async (tx) => {
      const result = await tx.execute<{ name: string }>(
        sql`select name from gyms where id = ${beta.gymId}::uuid`,
      );
      return result.rows[0]?.name;
    });
    expect(betaName).not.toBe('hijacked');
  });

  it('deletes zero rows when targeting another studio', async () => {
    const affected = await withTenant(alpha.studioId, async (tx) => {
      const result = await tx.execute(sql`delete from gyms where id = ${beta.gymId}::uuid`);
      return result.rowCount;
    });

    expect(affected).toBe(0);
  });

  /**
   * The case that USING alone does not cover, and the reason every policy here carries an
   * explicit WITH CHECK. Reading and updating are already blocked by USING; INSERT is the
   * one that would otherwise let a studio write a row stamped with someone else's id.
   */
  it('rejects an INSERT stamped with another studio id', async () => {
    await expectRejectionCode(
      withTenant(alpha.studioId, async (tx) => {
        await tx.insert(gyms).values({ studioId: beta.studioId, name: 'smuggled', code: 'SMUG' });
      }),
      RLS_VIOLATION,
    );
  });

  it('rejects moving one of its own rows into another studio', async () => {
    await expectRejectionCode(
      withTenant(alpha.studioId, async (tx) => {
        await tx.execute(
          sql`update gyms set studio_id = ${beta.studioId}::uuid where id = ${alpha.gymId}::uuid`,
        );
      }),
      RLS_VIOLATION,
    );
  });
});

describe('composite foreign keys', () => {
  /**
   * Defence that survives an RLS mistake. Policies filter which rows you can see; they do
   * not validate what a row POINTS AT. Only the composite FK makes "my membership,
   * registered at your branch" unrepresentable.
   */
  it('refuses a membership registered at another studio gym', async () => {
    await expectRejectionCode(
      withTenant(alpha.studioId, async (tx) => {
        await tx.insert(memberships).values({
          studioId: alpha.studioId,
          userId: alpha.userId,
          role: 'trainer',
          registeredGymId: beta.gymId,
        });
      }),
      FK_VIOLATION,
    );
  });
});

describe('no tenant context', () => {
  it('denies every tenant-scoped table', async () => {
    const counts = await runAsSystem('test:no-context-scan', async (tx) => {
      const result = await tx.execute<{ studios: string; gyms: string; memberships: string }>(
        sql`select (select count(*)::text from studios) as studios,
                   (select count(*)::text from gyms) as gyms,
                   (select count(*)::text from memberships) as memberships`,
      );
      return result.rows[0];
    });

    expect(counts).toEqual({ studios: '0', gyms: '0', memberships: '0' });
  });

  /**
   * users is global by design: OTP login has to find someone by phone before it knows
   * which studio they are signing into. This is the one table that must stay reachable
   * with no tenant pinned.
   */
  it('still allows the auth path to find a user by phone', async () => {
    const found = await runAsSystem('test:auth-lookup', async (tx) => {
      const result = await tx.execute<{ n: string }>(
        sql`select count(*)::text as n from users where id = ${alpha.userId}::uuid`,
      );
      return Number(result.rows[0]?.n ?? '-1');
    });

    expect(found).toBe(1);
  });
});

describe('global users table', () => {
  it('shows a studio only the users who hold a membership with it', async () => {
    const alphaSees = await withTenant(alpha.studioId, async (tx) => {
      const result = await tx.execute<{ n: string }>(
        sql`select count(*)::text as n from users where id in (${alpha.userId}::uuid, ${beta.userId}::uuid)`,
      );
      return Number(result.rows[0]?.n ?? '-1');
    });

    // Alpha's own member is visible; beta's is not, despite users having no studio_id.
    expect(alphaSees).toBe(1);
  });

  it('reveals the same person to both studios once they hold both memberships', async () => {
    // The whole reason users is global: one trainer, two studios, one identity.
    await withTenant(beta.studioId, async (tx) => {
      await tx
        .insert(memberships)
        .values({ studioId: beta.studioId, userId: alpha.userId, role: 'trainer' });
    });

    const visibleToBeta = await withTenant(beta.studioId, async (tx) => {
      const result = await tx.execute<{ n: string }>(
        sql`select count(*)::text as n from users where id = ${alpha.userId}::uuid`,
      );
      return Number(result.rows[0]?.n ?? '-1');
    });

    expect(visibleToBeta).toBe(1);
  });
});

describe('withTenant input handling', () => {
  it.each([
    ['not-a-uuid', 'plain string'],
    ["' or '1'='1", 'injection attempt'],
    ['', 'empty string'],
    ['11111111-1111-4111-8111-11111111111', 'one character short'],
  ])('rejects %j as a studio id (%s)', async (value) => {
    await expect(withTenant(value, async () => 'unreachable')).rejects.toThrow(/UUID/);
  });

  it('rolls back on error, leaving no partial write', async () => {
    const code = `RB${randomUUID().slice(0, 6)}`;

    await expect(
      withTenant(alpha.studioId, async (tx) => {
        await tx.insert(gyms).values({ studioId: alpha.studioId, name: 'rollback', code });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const survived = await withTenant(alpha.studioId, async (tx) => {
      const result = await tx.execute<{ n: string }>(
        sql`select count(*)::text as n from gyms where code = ${code}`,
      );
      return Number(result.rows[0]?.n ?? '-1');
    });

    expect(survived).toBe(0);
  });
});
