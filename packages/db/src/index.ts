/**
 * Public surface of @forge/db.
 *
 * Note what is NOT exported: the connection pools and the raw drizzle instances. They stay
 * private to client.ts so that no consumer can hold a handle capable of querying without a
 * tenant pinned. withTenant() and its siblings are the only door, and an ESLint rule
 * enforces the same thing statically — a comment is not a guarantee.
 */
export { initDb, closeDb, type DbConfig, type ForgeDatabase } from './client.js';

export {
  withTenant,
  withTenantRead,
  runAs,
  runAsSystem,
  setSystemAuditLogger,
  takeFirst,
  takeFirstOrThrow,
  type TenantTransaction,
  type SystemAuditLogger,
} from './tenant.js';

export { resolveAccessibleGyms, assertGymAccessible, accessibleGymsFilter } from './access.js';

export { toBusinessDate, businessDayRange, DEFAULT_TIMEZONE } from './business-date.js';

export * from './schema/index.js';
