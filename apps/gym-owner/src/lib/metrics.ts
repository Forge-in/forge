import {
  CHURN_RISK_THRESHOLD,
  MEMBERS,
  MEMBER_FILTERS,
  REVENUE_SERIES,
  type Member,
  type MemberFilter,
  type RevenueScope,
  type RevenueSeries,
  type Tone,
} from './data';
import { subscriberNumber } from './format';

/**
 * Derivations over the dataset.
 *
 * Kept out of components so the rules that decide "is this member a churn
 * risk", "which bar is the peak", "does this search match" are stated once and
 * can be unit-tested without rendering anything.
 */

/* -------------------------------------------------------------------------- */
/* Members                                                                    */
/* -------------------------------------------------------------------------- */

export interface MemberQuery {
  query: string;
  filter: MemberFilter;
}

export function isMemberFilter(value: unknown): value is MemberFilter {
  return typeof value === 'string' && (MEMBER_FILTERS as readonly string[]).includes(value);
}

/**
 * Does this member match what was typed?
 *
 * Name matches on substring, so "nair" finds "Priya Nair". Phone matches on
 * DIGITS ONLY on both sides — the roll stores "99678 40921" and a person
 * searching types "9967840921", and comparing the raw strings finds neither.
 */
function matchesQuery(member: Member, query: string): boolean {
  if (!query) return true;

  if (member.name.toLowerCase().includes(query.toLowerCase())) return true;

  const typedDigits = query.replace(/\D/g, '');
  // A query with no digits at all must not fall through to a phone match:
  // `''.includes('')` is true, which would make every member match.
  if (!typedDigits) return false;

  return subscriberNumber(member.phone).includes(typedDigits);
}

function matchesFilter(member: Member, filter: MemberFilter): boolean {
  if (filter === 'All') return true;
  // "Dues" cuts across statuses: an Expiring member with a balance belongs here
  // and an Overdue one whose balance was just cleared does not.
  if (filter === 'Dues') return member.due > 0;
  return member.status === filter;
}

export function filterMembers(
  members: readonly Member[],
  { query, filter }: MemberQuery,
): readonly Member[] {
  const trimmed = query.trim();
  return members.filter((member) => matchesQuery(member, trimmed) && matchesFilter(member, filter));
}

/** Members whose attendance has fallen far enough to read as a churn risk. */
export function isChurnRisk(member: Member): boolean {
  // A frozen membership is not a risk signal — it is a paused one.
  if (member.status === 'Frozen') return false;
  return member.attendance < CHURN_RISK_THRESHOLD;
}

/** The count for the sidebar's "Members" badge. */
export function membersWithDues(members: readonly Member[] = MEMBERS): number {
  return members.filter((member) => member.due > 0).length;
}

/* -------------------------------------------------------------------------- */
/* Charts                                                                     */
/* -------------------------------------------------------------------------- */

export interface ChartBar {
  key: string;
  value: number;
  /** Empty for an unlabelled tick, so the axis stays readable at 30 bars. */
  label: string;
  /** 0..1 of the tallest bar. */
  share: number;
  /** The single tallest bar, drawn in gold so the chart has a focal point. */
  peak: boolean;
  /** A period that has not happened yet: drawn as a stub, never as zero height. */
  empty: boolean;
}

/**
 * Turns a series into drawable bars.
 *
 * `max` is computed from the values rather than passed in, so a scope switch
 * cannot leave the previous scale behind and squash the new chart. A series
 * that is entirely zeros yields `share: 0` everywhere instead of dividing by
 * zero — which is reachable on the first day of a financial year.
 */
export function chartBars(
  values: readonly number[],
  labels: readonly string[],
  every = 1,
): ChartBar[] {
  const max = values.reduce((acc, value) => Math.max(acc, value), 0);
  const peakIndex = max > 0 ? values.indexOf(max) : -1;

  return values.map((value, index) => ({
    key: `${index}-${labels[index] ?? ''}`,
    value,
    label: index % every === 0 ? (labels[index] ?? '') : '',
    share: max > 0 ? value / max : 0,
    peak: index === peakIndex,
    empty: value === 0,
  }));
}

export function isRevenueScope(value: unknown): value is RevenueScope {
  return value === 'Day' || value === 'Month' || value === 'Year';
}

export function revenueSeries(scope: RevenueScope): RevenueSeries {
  return REVENUE_SERIES[scope];
}

/* -------------------------------------------------------------------------- */
/* Ring gauges                                                                */
/* -------------------------------------------------------------------------- */

/**
 * `stroke-dasharray` / `stroke-dashoffset` for a progress ring.
 *
 * The circumference is computed from the radius rather than hard-coded, because
 * the source design carried a literal `527.8` that only matched one radius —
 * change the ring size and the arc silently stops reaching the end.
 *
 * The fraction is clamped: an over-capacity gym (69 of 68) would otherwise
 * produce a negative offset and draw the arc backwards over itself.
 */
export function ringGeometry(radius: number, fraction: number) {
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(Number.isFinite(fraction) ? fraction : 0, 0), 1);

  return {
    circumference,
    dashArray: circumference.toFixed(2),
    dashOffset: (circumference * (1 - clamped)).toFixed(2),
  };
}

/* -------------------------------------------------------------------------- */
/* Occupancy and capacity                                                     */
/* -------------------------------------------------------------------------- */

/**
 * How full something is, as a tone.
 *
 * At or over capacity is neutral, not warn: a full class is a sold-out class.
 * The warn band is for a room under sustained pressure, which the classes
 * screen decides for itself with a threshold.
 */
export function fillTone(filled: number, capacity: number): Tone {
  if (capacity <= 0) return 'neutral';
  if (filled === 0) return 'neutral';
  if (filled >= capacity) return 'neutral';
  return 'gold';
}

/* -------------------------------------------------------------------------- */
/* Greeting                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * "Good morning" / "Good afternoon" / "Good evening", in the GYM's timezone.
 *
 * Fixed to IST rather than read from the runtime clock's zone. A server in
 * another region would otherwise greet a Pune owner good morning at 9 PM, and —
 * worse — the server and the browser would compute different words for the same
 * moment, which React reports as a hydration mismatch on the page's largest
 * heading.
 *
 * Exported with an injectable clock so the boundaries are testable without
 * waiting for 4 AM.
 */
const IST_OFFSET_MINUTES = 5 * 60 + 30;
const MINUTES_PER_DAY = 24 * 60;

export function greeting(now: Date = new Date()): string {
  const istMinutes = now.getTime() / 60_000 + IST_OFFSET_MINUTES;
  // Two modulos, because the first can be negative for a pre-epoch date and a
  // negative hour would fall through to "Good evening".
  const minuteOfDay = ((istMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const istHour = Math.floor(minuteOfDay / 60);

  if (istHour < 12) return 'Good morning';
  if (istHour < 17) return 'Good afternoon';
  return 'Good evening';
}
