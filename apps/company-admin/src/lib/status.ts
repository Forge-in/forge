import type { StatusLabel } from './data/types';

/**
 * Status colour is a four-tone system, shared by gyms, invoices and alerts:
 *
 *   accent      — healthy / settled
 *   sub         — in flight, nothing wrong yet
 *   accent-deep — needs a human
 *   dim         — inactive, no longer counted
 */
export type StatusTone = 'accent' | 'sub' | 'accent-deep' | 'dim';

const TONE_BY_STATUS: Readonly<Record<StatusLabel, StatusTone>> = {
  Active: 'accent',
  Paid: 'accent',
  Trial: 'sub',
  Pending: 'sub',
  'Past due': 'accent-deep',
  Failed: 'accent-deep',
  Suspended: 'accent-deep',
  Churned: 'dim',
};

const DOT_CLASS: Readonly<Record<StatusTone, string>> = {
  accent: 'bg-accent',
  sub: 'bg-sub',
  'accent-deep': 'bg-accent-deep',
  dim: 'bg-dim',
};

export function statusTone(status: StatusLabel): StatusTone {
  return TONE_BY_STATUS[status] ?? 'dim';
}

/** Tailwind background class for a status dot. */
export function statusDotClass(status: StatusLabel): string {
  return DOT_CLASS[statusTone(status)];
}
