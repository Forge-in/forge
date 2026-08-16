import { AUDIT_KINDS, GYM_STATUSES, PLAN_NAMES } from './data/types';
import type { AuditKind, GymStatus, PlanName } from './data/types';
import { GYM_SORTS, type GymFilters, type GymSort } from './metrics';

/**
 * Filter state lives in the URL so a filtered view can be shared, bookmarked and
 * walked back through with the browser's own buttons.
 *
 * Everything read out of the URL is untrusted, so each value is validated against
 * its allowed set and falls back to the default rather than throwing.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function oneOf<T extends string>(
  value: string | string[] | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const candidate = first(value);
  return allowed.includes(candidate as T) ? (candidate as T) : fallback;
}

export const DEFAULT_GYM_FILTERS: GymFilters = {
  query: '',
  plan: 'All',
  status: 'All',
  sort: 'members',
};

export function parseGymFilters(params: SearchParams): GymFilters {
  return {
    query: first(params.q) ?? '',
    plan: oneOf<PlanName | 'All'>(params.plan, ['All', ...PLAN_NAMES], 'All'),
    status: oneOf<GymStatus | 'All'>(params.status, ['All', ...GYM_STATUSES], 'All'),
    sort: oneOf<GymSort>(params.sort, GYM_SORTS, DEFAULT_GYM_FILTERS.sort),
  };
}

export function parseAuditKind(params: SearchParams): AuditKind | 'All' {
  return oneOf<AuditKind | 'All'>(params.kind, ['All', ...AUDIT_KINDS], 'All');
}
