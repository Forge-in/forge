import {
  CLASS_VIEWS,
  FEE_BUCKETS,
  MEMBER_FILTERS,
  REVENUE_SCOPES,
  STAFF_FILTERS,
  WEEKDAYS,
  type ClassView,
  type FeeBucket,
  type MemberFilter,
  type RevenueScope,
  type StaffFilter,
  type Weekday,
} from './data/types';
import { CURRENT_DAY } from './data/floor';

/**
 * Filter state lives in the URL, not in component state.
 *
 * Three things follow from that and none of them are available to `useState`:
 * a filtered view can be sent to the front desk as a link, the browser's own
 * back button walks the refinements, and — because these are server components
 * — the filtering happens on the server, so a page of 412 members never ships
 * the rows the owner filtered out.
 *
 * EVERYTHING READ HERE IS UNTRUSTED. A query string is user input, and it is
 * the one input that arrives without a form around it. Each value is checked
 * against its allowed set and falls back to the default rather than throwing,
 * so `?status=<script>` renders the unfiltered table instead of a 500.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The first value for a key.
 *
 * `?status=a&status=b` parses to an array, and every consumer here wants one
 * value — taking the array through would make `includes` fail its type check
 * and, worse, silently reject a legitimate duplicated parameter.
 */
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

/* -------------------------------------------------------------------------- */
/* Per-screen parsers                                                         */
/* -------------------------------------------------------------------------- */

export interface MemberFilters {
  query: string;
  status: MemberFilter;
}

export function parseMemberFilters(params: SearchParams): MemberFilters {
  return {
    // Left untrimmed: the search box syncs itself from this value, and trimming
    // here would edit the box mid-keystroke. `filterMembers` trims at the point
    // of use instead.
    query: first(params.q) ?? '',
    status: oneOf<MemberFilter>(params.status, MEMBER_FILTERS, 'All'),
  };
}

export function parseRevenueScope(params: SearchParams): RevenueScope {
  return oneOf<RevenueScope>(params.scope, REVENUE_SCOPES, 'Month');
}

export function parseFeeBucket(params: SearchParams): FeeBucket {
  // Overdue first: it is the bucket with money at risk, so it is the one an
  // owner opening "Fees & dues" cold almost always wants.
  return oneOf<FeeBucket>(params.bucket, FEE_BUCKETS, 'Overdue');
}

export interface ClassFilters {
  day: Weekday;
  view: ClassView;
}

export function parseClassFilters(params: SearchParams): ClassFilters {
  return {
    day: oneOf<Weekday>(params.day, WEEKDAYS, CURRENT_DAY),
    view: oneOf<ClassView>(params.view, CLASS_VIEWS, 'Group'),
  };
}

export function parseStaffFilter(params: SearchParams): StaffFilter {
  return oneOf<StaffFilter>(params.role, STAFF_FILTERS, 'All');
}
