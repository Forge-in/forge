/**
 * The console's information architecture, in one place: what the sidebar shows,
 * what the top bar reads, and which counter (if any) sits on each item.
 */

export const CONSOLE_SECTIONS = [
  'overview',
  'gyms',
  'revenue',
  'plans',
  'billing',
  'team',
  'audit',
  'settings',
] as const;

export type ConsoleSection = (typeof CONSOLE_SECTIONS)[number];

/** Which live counter, if any, renders on the right of a nav item. */
export type NavCounter = 'gyms' | 'invoices';

export interface NavItem {
  section: ConsoleSection;
  href: string;
  label: string;
  counter?: NavCounter;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { section: 'overview', href: '/overview', label: 'Overview' },
  { section: 'gyms', href: '/gyms', label: 'Gyms', counter: 'gyms' },
  { section: 'revenue', href: '/revenue', label: 'Revenue' },
  { section: 'plans', href: '/plans', label: 'Plans' },
  { section: 'billing', href: '/billing', label: 'Billing', counter: 'invoices' },
  { section: 'team', href: '/team', label: 'Team & roles' },
  { section: 'audit', href: '/audit', label: 'Audit log' },
  { section: 'settings', href: '/settings', label: 'Settings' },
];

export interface PageHeading {
  title: string;
  subtitle: string;
}

export const SECTION_HEADINGS: Readonly<Record<ConsoleSection, PageHeading>> = {
  overview: { title: 'Overview', subtitle: 'All regions · last 30 days' },
  gyms: { title: 'Gyms', subtitle: 'Every registered organisation' },
  revenue: {
    title: 'Revenue & subscriptions',
    subtitle: 'Recurring revenue, churn and collections',
  },
  plans: { title: 'Plans & pricing', subtitle: 'Three tiers, billed per site per month' },
  billing: { title: 'Billing', subtitle: 'Invoices and collections' },
  team: { title: 'Team & roles', subtitle: 'Who can do what inside Wrath Core' },
  audit: { title: 'Audit log', subtitle: 'Every privileged action, retained 18 months' },
  settings: { title: 'Settings', subtitle: 'Organisation, trials and keys' },
};

/**
 * Maps a pathname to the nav item that should read as current. A gym detail page
 * lives under `/gyms/:id` and keeps "Gyms" lit.
 */
export function sectionFromPathname(pathname: string): ConsoleSection | null {
  const [, first] = pathname.split('/');
  return CONSOLE_SECTIONS.find((section) => section === first) ?? null;
}

/** The gym id when the pathname is a gym detail route, otherwise null. */
export function gymIdFromPathname(pathname: string): string | null {
  const match = /^\/gyms\/([^/]+)\/?$/.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
