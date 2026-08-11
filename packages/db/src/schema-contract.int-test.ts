import { Role } from '@forge/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, initDb } from './client.js';
import { GYM_ACCESS, MEMBERSHIP_STATUS } from './schema/index.js';
import { runAsSystem } from './tenant.js';

/**
 * Guards the seams where the same fact is written down twice.
 *
 * Each of these pairs is currently in agreement by hand. Without a test, the first person
 * to add a role in TypeScript gets a CHECK constraint violation in production rather than
 * a red build — and the failure surfaces as "insert failed" on a code path nobody
 * associates with the enum they edited.
 */

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL must be set and must be the forge_app role');

beforeAll(() => initDb({ url: databaseUrl, maxConnections: 1 }));
afterAll(() => closeDb());

/** Pulls the literal values out of a `col IN ('a','b')` CHECK constraint definition. */
async function checkConstraintValues(constraintName: string): Promise<string[]> {
  return runAsSystem(`test:read-constraint:${constraintName}`, async (tx) => {
    const result = await tx.execute<{ definition: string }>(
      sql`select pg_get_constraintdef(oid) as definition
            from pg_constraint
           where conname = ${constraintName}`,
    );

    const definition = result.rows[0]?.definition;
    if (!definition) throw new Error(`Constraint ${constraintName} does not exist`);

    return [...definition.matchAll(/'([^']+)'::text/g)].map((match) => match[1] ?? '').sort();
  });
}

describe('role vocabulary', () => {
  it('matches Role in @forge/shared exactly', async () => {
    const inDatabase = await checkConstraintValues('memberships_role_check');
    const inCode = Object.values(Role).sort();

    // Both directions matter. A value in code but not the DB fails at insert time in
    // production; a value in the DB but not in code is a row no client can render.
    expect(inDatabase).toEqual(inCode);
  });

  it('is the single source of truth — the admin console must not invent its own roles', () => {
    // apps/admin currently ships TEAM_ROLES (Superadmin, Ops, Finance, ...) for a display
    // table. That is a different concept from platform authorization and must never be
    // used to gate an endpoint. This assertion documents the boundary: these four strings,
    // and only these, are authorization roles.
    expect(Object.values(Role)).toEqual(['platform_admin', 'gym_owner', 'trainer', 'gym_user']);
  });
});

describe('membership enums', () => {
  it('gym_access CHECK matches GYM_ACCESS', async () => {
    const inDatabase = await checkConstraintValues('memberships_gym_access_check');
    expect(inDatabase).toEqual([...GYM_ACCESS].sort());
  });

  it('status CHECK matches MEMBERSHIP_STATUS', async () => {
    const inDatabase = await checkConstraintValues('memberships_status_check');
    expect(inDatabase).toEqual([...MEMBERSHIP_STATUS].sort());
  });

  it("still defaults gym_access to 'all', which resolveAccessibleGyms relies on", async () => {
    const defaultValue = await runAsSystem('test:read-default', async (tx) => {
      const result = await tx.execute<{ default_value: string | null }>(
        sql`select column_default as default_value
              from information_schema.columns
             where table_name = 'memberships' and column_name = 'gym_access'`,
      );
      return result.rows[0]?.default_value;
    });

    expect(defaultValue).toContain("'all'");
  });
});

describe('phone storage', () => {
  it('enforces E.164 at the database, not only at the API boundary', async () => {
    // phoneSchema in @forge/shared validates on the way in, but an import script or a psql
    // session bypasses the API entirely — so the column carries its own constraint.
    const definition = await runAsSystem('test:read-phone-check', async (tx) => {
      const result = await tx.execute<{ definition: string }>(
        sql`select pg_get_constraintdef(oid) as definition
              from pg_constraint where conname = 'users_phone_e164_check'`,
      );
      return result.rows[0]?.definition ?? '';
    });

    expect(definition).toContain('~');
    expect(definition).toContain('+');
  });
});
