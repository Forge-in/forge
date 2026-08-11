import { describe, expect, it } from 'vitest';

import { Role } from './roles.js';
import type { AuthTokenPayload } from './token.js';

describe('Role', () => {
  // These strings are persisted in the database and signed into JWTs. Renaming a value
  // is a data migration plus a forced logout of every client holding an old token, so
  // the wire format is pinned here deliberately — this test SHOULD fail on a rename.
  it('has the exact wire values the DB and JWTs store', () => {
    expect(Role).toEqual({
      PLATFORM_ADMIN: 'platform_admin',
      GYM_OWNER: 'gym_owner',
      TRAINER: 'trainer',
      GYM_USER: 'gym_user',
    });
  });

  it('covers all four roles and no more', () => {
    expect(Object.values(Role)).toHaveLength(4);
  });

  it('uses snake_case throughout, matching the Postgres enum convention', () => {
    for (const value of Object.values(Role)) {
      expect(value).toMatch(/^[a-z]+(_[a-z]+)*$/);
    }
  });

  it('has no duplicate values, so a role can never be ambiguous', () => {
    const values = Object.values(Role);
    expect(new Set(values).size).toBe(values.length);
  });

  // A `switch` over Role must stay exhaustive. The `never` assignment below is the
  // actual assertion: adding a fifth role fails typecheck here, which is exactly the
  // reminder we want, because every new role needs a deliberate authorization answer.
  it('is exhaustively switchable', () => {
    const describeRole = (role: Role): string => {
      switch (role) {
        case Role.PLATFORM_ADMIN:
          return 'platform';
        case Role.GYM_OWNER:
          return 'owner';
        case Role.TRAINER:
          return 'trainer';
        case Role.GYM_USER:
          return 'member';
        default: {
          const unhandled: never = role;
          return unhandled;
        }
      }
    };

    expect(Object.values(Role).map(describeRole)).toEqual([
      'platform',
      'owner',
      'trainer',
      'member',
    ]);
  });
});

describe('AuthTokenPayload', () => {
  // `tenantId: null` is reserved for platform_admin. Every other role is tenant-scoped,
  // and a null tenantId on one of them must be treated as a rejected token rather than
  // as "all gyms" — the guard that enforces this lands with the auth module.
  it('permits a null tenantId only as the platform-admin shape', () => {
    const platform: AuthTokenPayload = {
      sub: 'usr_1',
      tenantId: null,
      role: Role.PLATFORM_ADMIN,
    };
    const scoped: AuthTokenPayload = {
      sub: 'usr_2',
      tenantId: 'gym_1',
      role: Role.GYM_OWNER,
    };

    expect(platform.tenantId).toBeNull();
    expect(scoped.tenantId).toBe('gym_1');
  });
});
