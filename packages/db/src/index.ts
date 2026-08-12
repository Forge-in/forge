/**
 * Public surface of @forge/db.
 *
 * Note what is NOT exported: the connection pools and the raw drizzle instances. They stay
 * private to client.ts so that no consumer can hold a handle capable of querying without a
 * tenant pinned. withTenant() and its siblings are the only door, and an ESLint rule
 * enforces the same thing statically — a comment is not a guarantee.
 */
export { initDb, closeDb, pingDatabase, type DbConfig, type ForgeDatabase } from './client.js';

export {
  withTenant,
  withTenantRead,
  runAs,
  runAsSystem,
  withUser,
  setSystemAuditLogger,
  takeFirst,
  takeFirstOrThrow,
  type TenantTransaction,
  type SystemAuditLogger,
} from './tenant.js';

export { resolveAccessibleGyms, assertGymAccessible, accessibleGymsFilter } from './access.js';

export { toBusinessDate, businessDayRange, DEFAULT_TIMEZONE } from './business-date.js';

// Query operators, so no consumer imports drizzle-orm directly — see operators.ts for the
// duplicate-instance failure that makes this a rule rather than a convenience.
export * from './operators.js';

export * from './schema/index.js';
