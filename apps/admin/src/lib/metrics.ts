import { GYMS, INVOICES, MRR_MONTHS, MRR_SERIES, PLAN_NAMES } from './data';
import type { Gym, GymStatus, Invoice, PlanName } from './data/types';
import { formatMoney, parseMoney, ratio } from './format';

/**
 * Every derived number the console shows is computed here, as a pure function of
 * the fixtures. Keeping it out of components means the maths is reviewable in
 * one place and stays correct when the fixtures become API responses.
 */

/** Churned accounts stay in the directory but drop out of every platform total. */
export function liveGyms(gyms: readonly Gym[] = GYMS): Gym[] {
  return gyms.filter((gym) => gym.status !== 'Churned');
}

export interface PlatformMetrics {
  live: Gym[];
  gymCount: number;
  memberCount: number;
  mrrTotal: number;
  arr: number;
  trialCount: number;
  pastDue: Gym[];
}

export function platformMetrics(gyms: readonly Gym[] = GYMS): PlatformMetrics {
  const live = liveGyms(gyms);
  const mrrTotal = live.reduce((total, gym) => total + gym.mrr, 0);

  return {
    live,
    gymCount: live.length,
    memberCount: live.reduce((total, gym) => total + gym.members, 0),
    mrrTotal,
    arr: mrrTotal * 12,
    trialCount: live.filter((gym) => gym.status === 'Trial').length,
    pastDue: live.filter((gym) => gym.status === 'Past due'),
  };
}

/* -------------------------------------------------------------------------- */
/* Directory filtering                                                        */
/* -------------------------------------------------------------------------- */

export const GYM_SORTS = ['members', 'mrr', 'name', 'sites'] as const;
export type GymSort = (typeof GYM_SORTS)[number];

export const GYM_SORT_LABELS: Readonly<Record<GymSort, string>> = {
  members: 'Sort · Members',
  mrr: 'Sort · MRR',
  name: 'Sort · Name',
  sites: 'Sort · Sites',
};

export interface GymFilters {
  query: string;
  plan: PlanName | 'All';
  status: GymStatus | 'All';
  sort: GymSort;
}

const COMPARATORS: Readonly<Record<GymSort, (a: Gym, b: Gym) => number>> = {
  members: (a, b) => b.members - a.members,
  mrr: (a, b) => b.mrr - a.mrr,
  sites: (a, b) => b.sites - a.sites,
  name: (a, b) => a.name.localeCompare(b.name),
};

function matchesQuery(gym: Gym, query: string): boolean {
  if (!query) return true;
  return [gym.name, gym.city, gym.owner, gym.email].some((field) =>
    field.toLowerCase().includes(query),
  );
}

export function filterGyms(filters: GymFilters, gyms: readonly Gym[] = GYMS): Gym[] {
  const query = filters.query.trim().toLowerCase();

  return gyms
    .filter(
      (gym) =>
        (filters.plan === 'All' || gym.plan === filters.plan) &&
        (filters.status === 'All' || gym.status === filters.status) &&
        matchesQuery(gym, query),
    )
    .slice()
    .sort(COMPARATORS[filters.sort]);
}

/* -------------------------------------------------------------------------- */
/* Charts                                                                     */
/* -------------------------------------------------------------------------- */

export interface MrrBar {
  label: string;
  /** 0-100, relative to the tallest month. */
  heightPercent: number;
  /** The most recent month is drawn in the accent colour. */
  current: boolean;
}

export function mrrBars(): MrrBar[] {
  if (MRR_SERIES.length === 0) return [];
  const peak = Math.max(...MRR_SERIES);

  return MRR_SERIES.map((value, index) => ({
    label: MRR_MONTHS[index] ?? '',
    heightPercent: peak === 0 ? 0 : Math.round((value / peak) * 100),
    current: index === MRR_SERIES.length - 1,
  }));
}

export interface PlanSplitRow {
  plan: PlanName;
  value: string;
  percentLabel: string;
  widthPercent: number;
  accounts: number;
  /** Enterprise is the emphasised band. */
  emphasised: boolean;
}

export function planSplit(gyms: readonly Gym[] = GYMS): PlanSplitRow[] {
  const live = liveGyms(gyms);
  const total = live.reduce((sum, gym) => sum + gym.mrr, 0);

  return PLAN_NAMES.map((plan) => {
    const accounts = live.filter((gym) => gym.plan === plan);
    const value = accounts.reduce((sum, gym) => sum + gym.mrr, 0);
    const percent = Math.round(ratio(value, total) * 100);

    return {
      plan,
      value: formatMoney(value),
      percentLabel: `${percent}%`,
      widthPercent: percent,
      accounts: accounts.length,
      emphasised: plan === 'Enterprise',
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Revenue tables                                                             */
/* -------------------------------------------------------------------------- */

export interface TopAccount {
  gym: Gym;
  sharePercent: string;
}

export function topAccounts(limit = 6, gyms: readonly Gym[] = GYMS): TopAccount[] {
  const live = liveGyms(gyms);
  const total = live.reduce((sum, gym) => sum + gym.mrr, 0);

  return live
    .slice()
    .sort((a, b) => b.mrr - a.mrr)
    .slice(0, limit)
    .map((gym) => ({ gym, sharePercent: `${Math.round(ratio(gym.mrr, total) * 100)}%` }));
}

export interface RiskRow {
  gym: Gym;
  reason: string;
}

/** Anything with failing payments or a health score under 75. */
export function atRiskAccounts(gyms: readonly Gym[] = GYMS): RiskRow[] {
  return liveGyms(gyms)
    .filter((gym) => gym.health < 75 || gym.status === 'Past due')
    .map((gym) => ({
      gym,
      reason:
        gym.status === 'Past due' ? 'Payment failed twice' : `Usage down, health ${gym.health}`,
    }));
}

/** The overview's shortlist: past due first, then the worst health scores. */
export function attentionAccounts(limit = 4, gyms: readonly Gym[] = GYMS): RiskRow[] {
  const live = liveGyms(gyms);
  const pastDue = live.filter((gym) => gym.status === 'Past due');
  const unhealthy = live.filter((gym) => gym.health < 65 && gym.status !== 'Past due');

  return [...pastDue, ...unhealthy].slice(0, limit).map((gym) => ({
    gym,
    reason: gym.status === 'Past due' ? 'Two failed charges' : `Health ${gym.health} · owner idle`,
  }));
}

export interface DunningRow {
  invoice: Invoice;
  attempt: string;
}

export function failedInvoices(invoices: readonly Invoice[] = INVOICES): Invoice[] {
  return invoices.filter((invoice) => invoice.status === 'Failed');
}

export function dunningRows(invoices: readonly Invoice[] = INVOICES): DunningRow[] {
  return failedInvoices(invoices).map((invoice) => ({ invoice, attempt: 'Attempt 2 of 4' }));
}

/** Total rupees stuck in dunning, read back off the invoice amounts. */
export function dunningValue(invoices: readonly Invoice[] = INVOICES): number {
  return failedInvoices(invoices).reduce((sum, invoice) => sum + parseMoney(invoice.amount), 0);
}

export interface RenewalRow {
  gym: Gym;
  date: string;
}

export function upcomingRenewals(limit = 5, gyms: readonly Gym[] = GYMS): RenewalRow[] {
  return liveGyms(gyms)
    .slice(0, limit)
    .map((gym, index) => ({ gym, date: `${14 + index * 3} Aug` }));
}

/** Newest registrations, most recent first. */
export function recentlyRegistered(limit = 5, gyms: readonly Gym[] = GYMS): Gym[] {
  return liveGyms(gyms).slice(-limit).reverse();
}

/* -------------------------------------------------------------------------- */
/* Gym detail                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Billing history for one organisation: its real invoices first, then synthesised
 * prior months so the panel always shows a full four rows.
 */
export function invoicesForGym(gym: Gym, limit = 4): Invoice[] {
  const real = INVOICES.filter((invoice) => invoice.org === gym.name);
  const amount = formatMoney(gym.mrr);

  const backfill: Invoice[] = [
    {
      id: 'WF-2026-0392',
      org: gym.name,
      period: 'Jul 2026',
      amount,
      method: 'Autopay',
      status: 'Paid',
    },
    {
      id: 'WF-2026-0366',
      org: gym.name,
      period: 'Jun 2026',
      amount,
      method: 'Autopay',
      status: 'Paid',
    },
    {
      id: 'WF-2026-0341',
      org: gym.name,
      period: 'May 2026',
      amount,
      method: 'Autopay',
      status: 'Paid',
    },
  ];

  return [...real, ...backfill].slice(0, limit);
}

export function seatLabel(gym: Gym): string {
  return `${gym.seatsUsed} / ${gym.seatsTotal}`;
}
