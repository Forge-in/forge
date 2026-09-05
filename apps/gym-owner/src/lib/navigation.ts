/**
 * The console's information architecture, in one place: what the sidebar shows,
 * what the top bar reads, and which live counter (if any) sits on each item.
 */

export const CONSOLE_SECTIONS = [
  'overview',
  'check-ins',
  'classes',
  'members',
  'revenue',
  'fees',
  'plan',
  'staff',
  'trainer-mobile',
  'support',
  'settings',
] as const;

export type ConsoleSection = (typeof CONSOLE_SECTIONS)[number];

/**
 * Which counter renders on the right of a nav item.
 *
 * A key rather than a number, because the sidebar is a client component and the
 * counts come from the data layer — resolving them here would either freeze
 * them at module load or drag the dataset into the bundle twice.
 */
export type NavCounter = 'members' | 'dues' | 'trainerApp';

export interface NavItem {
  section: ConsoleSection;
  href: `/${string}`;
  label: string;
  counter?: NavCounter;
}

export interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

/**
 * Grouped by what the owner is *doing*, not by which team built it: running the
 * floor today, chasing the money, managing people, and the account itself.
 */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: 'Operate',
    items: [
      { section: 'overview', href: '/overview', label: 'Overview' },
      { section: 'check-ins', href: '/check-ins', label: 'Check-ins' },
      { section: 'classes', href: '/classes', label: 'Classes & sessions' },
      { section: 'members', href: '/members', label: 'Members', counter: 'members' },
    ],
  },
  {
    label: 'Money',
    items: [
      { section: 'revenue', href: '/revenue', label: 'Revenue' },
      { section: 'fees', href: '/fees', label: 'Fees & dues', counter: 'dues' },
      { section: 'plan', href: '/plan', label: 'My Wrath plan' },
    ],
  },
  {
    label: 'Team',
    items: [
      { section: 'staff', href: '/staff', label: 'Staff' },
      {
        section: 'trainer-mobile',
        href: '/trainer-mobile',
        label: 'Trainer mobile',
        counter: 'trainerApp',
      },
    ],
  },
  {
    label: 'Account',
    items: [
      { section: 'support', href: '/support', label: 'Report an issue' },
      { section: 'settings', href: '/settings', label: 'Gym profile' },
    ],
  },
];

/** Where a signed-in owner lands, and where the proxy sends `/`. */
export const CONSOLE_HOME = '/overview';

export interface PageHeading {
  /** The mono eyebrow above the title. */
  crumb: string;
  title: string;
}

/**
 * Every heading except the overview's, which greets the owner by name and so
 * cannot be a constant. See `overviewHeading`.
 */
export const SECTION_HEADINGS: Readonly<Record<Exclude<ConsoleSection, 'overview'>, PageHeading>> =
  {
    'check-ins': { crumb: 'Operate', title: 'Check-ins & attendance' },
    classes: { crumb: 'Operate', title: 'Classes & sessions' },
    members: { crumb: 'Operate', title: 'Members' },
    revenue: { crumb: 'Money', title: 'Revenue' },
    fees: { crumb: 'Money', title: 'Fees & dues' },
    plan: { crumb: 'Money', title: 'My Wrath plan' },
    staff: { crumb: 'Team', title: 'Staff & roles' },
    'trainer-mobile': { crumb: 'Team', title: 'Trainer mobile' },
    support: { crumb: 'Account', title: 'Report an issue' },
    settings: { crumb: 'Account', title: 'Gym profile' },
  };

/**
 * Maps a pathname to the nav item that should read as current.
 *
 * Matches on the first segment only, so a future detail route such as
 * `/members/:id` keeps "Members" lit rather than lighting nothing.
 */
export function sectionFromPathname(pathname: string): ConsoleSection | null {
  const [, first] = pathname.split('/');
  return CONSOLE_SECTIONS.find((section) => section === first) ?? null;
}
