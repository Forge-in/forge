import type { ConsoleSection } from '../navigation';

/**
 * The overview screen's own content: the things that only exist because the
 * owner is looking at a summary, rather than being a slice of another screen.
 */

/* -------------------------------------------------------------------------- */
/* Banner                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The one alert that outranks the whole dashboard.
 *
 * Nullable on purpose: "nothing is on fire" is the common case, and a banner
 * that is always there is a banner nobody reads.
 */
export const TOP_BANNER: {
  title: string;
  sub: string;
  cta: string;
  toast: string;
} | null = {
  title: 'Auto-debit for 3 members failed last night',
  sub: '₹7,400 at risk · bank declined',
  cta: 'Retry all',
  toast: 'Retry queued for 3 mandates',
};

/* -------------------------------------------------------------------------- */
/* KPI row                                                                    */
/* -------------------------------------------------------------------------- */

export interface OverviewKpi {
  id: string;
  label: string;
  value: string;
  sub: string;
  delta: string;
  tone: 'ok' | 'warn';
  /** Every tile is a shortcut into the screen that explains it. */
  href: `/${ConsoleSection}`;
}

export const OVERVIEW_KPIS: readonly OverviewKpi[] = [
  {
    id: 'revenue',
    label: 'Revenue · Aug',
    value: '₹8,42,500',
    sub: '84% of ₹10,00,000 target',
    delta: '+12.1%',
    tone: 'ok',
    href: '/revenue',
  },
  {
    id: 'check-ins',
    label: 'Check-ins today',
    value: '284',
    sub: 'peak 6–8 PM · 41 first-timers',
    delta: '+6%',
    tone: 'ok',
    href: '/check-ins',
  },
  {
    id: 'members',
    label: 'Active members',
    value: '412',
    sub: '18 joined · 6 churned this month',
    delta: '+3%',
    tone: 'ok',
    href: '/members',
  },
  {
    id: 'fees',
    label: 'Fees pending',
    value: '₹96,300',
    sub: '23 members · 9 overdue 7+ days',
    delta: 'Action',
    tone: 'warn',
    href: '/fees',
  },
];

/* -------------------------------------------------------------------------- */
/* Needs your attention                                                       */
/* -------------------------------------------------------------------------- */

export interface AttentionItem {
  id: string;
  /** A single glyph, drawn in a bubble. Decorative — the title carries meaning. */
  icon: string;
  tone: 'warn' | 'gold' | 'neutral';
  title: string;
  meta: string;
  cta: string;
  href: `/${ConsoleSection}`;
}

/** Ordered by cost of ignoring it, not by recency. */
export const ATTENTION_ITEMS: readonly AttentionItem[] = [
  {
    id: 'unassigned-class',
    icon: '!',
    tone: 'warn',
    title: '7:30 AM Strength Foundations has no trainer',
    meta: 'Simran Kaur on leave till 22 Aug · 14 booked',
    cta: 'Assign',
    href: '/classes',
  },
  {
    id: 'overdue-fees',
    icon: '₹',
    tone: 'warn',
    title: '9 members overdue by more than a week',
    meta: '₹41,200 · oldest 21 days (Priya Nair)',
    cta: 'Chase',
    href: '/fees',
  },
  {
    id: 'document-expiry',
    icon: 'D',
    tone: 'neutral',
    title: 'Ramesh Yadav · police verification expires 28 Aug',
    meta: 'Cleaning staff · document renewal needed',
    cta: 'Open',
    href: '/staff',
  },
  {
    id: 'missing-id',
    icon: 'K',
    tone: 'neutral',
    title: 'Arjun Pillai signed up without ID proof',
    meta: 'Registered 17 Aug · access limited to day pass',
    cta: 'Verify',
    href: '/members',
  },
  {
    id: 'plan-renewal',
    icon: 'W',
    tone: 'gold',
    title: 'Wrath Pro renews in 24 days',
    meta: 'Card ending 4417 · ₹7,999 + GST',
    cta: 'Review',
    href: '/plan',
  },
];

/* -------------------------------------------------------------------------- */
/* Today on the floor                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The four sessions worth glancing at, not the whole day.
 *
 * Derived from `sessionsFor('Wed', 'Group')` in spirit, but curated: the strip
 * shows what is running now and what still needs a decision, which is a
 * different list from "the next four by clock time".
 */
export const TODAY_STRIP: readonly {
  id: string;
  hour: string;
  minute: string;
  name: string;
  trainer: string;
  filled: number;
  capacity: number;
  status: string;
  tone: 'gold' | 'warn' | 'neutral';
}[] = [
  {
    id: 't-hiit',
    hour: '06',
    minute: '00 AM',
    name: 'HIIT Conditioning',
    trainer: 'Rahul Mehra · Studio A',
    filled: 18,
    capacity: 20,
    status: 'Running',
    tone: 'gold',
  },
  {
    id: 't-strength',
    hour: '07',
    minute: '30 AM',
    name: 'Strength Foundations',
    trainer: 'No trainer assigned',
    filled: 14,
    capacity: 18,
    status: 'Unassigned',
    tone: 'warn',
  },
  {
    id: 't-crossfit',
    hour: '05',
    minute: '30 PM',
    name: 'CrossFit Circuit',
    trainer: 'Rahul Mehra · Rig',
    filled: 20,
    capacity: 20,
    status: '3 waitlist',
    tone: 'neutral',
  },
  {
    id: 't-zumba',
    hour: '07',
    minute: '00 PM',
    name: 'Zumba',
    trainer: 'Vikram Joshi · Studio B',
    filled: 6,
    capacity: 25,
    status: 'Low fill',
    tone: 'neutral',
  },
];

/* -------------------------------------------------------------------------- */
/* Chrome                                                                     */
/* -------------------------------------------------------------------------- */

/** The sync chip in the top bar. */
export const SYNC_LABEL = 'Synced 2 min ago';

/** Unread alerts, shown on the top-bar bell. Links to the reports screen. */
export const ALERT_COUNT = 5;

/** Members with an outstanding balance — the sidebar's "Fees & dues" counter. */
export const DUES_COUNT = 23;
