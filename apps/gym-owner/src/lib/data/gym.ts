import type {
  GymProfile,
  MembershipPlanOption,
  OperatingRules,
  PermissionSpec,
  RuleSpec,
  TrainerOption,
  TrainerPermission,
} from './types';

/**
 * The gym's own record, and everything derived from it.
 *
 * This is DEMO DATA standing in for endpoints that do not exist yet. It lives
 * behind `lib/data` rather than inside components for one reason: when the API
 * lands, the swap is this folder and nothing else. A component that reached for
 * a literal would have to be rewritten instead.
 *
 * The dataset is deliberately awkward — an unverified member, a stale device, a
 * trainer over their hour cap, an uncovered shift. A screen built against tidy
 * data hides exactly the states the owner opens the dashboard to find.
 */

/** The date every relative label in the dataset is written against. */
export const TODAY = 'Wed 19 Aug 2026';

export const DEFAULT_GYM_PROFILE: GymProfile = {
  name: 'Ironhold Fitness',
  legal: 'Ironhold Wellness LLP',
  phone: '020 4155 8890',
  email: 'front@ironhold.in',
  address: 'Survey 41, Baner Road, Pune 411045',
  gstin: '27AABCI1234K1ZV',
  hours: '5:30 AM – 11:00 PM',
  capacity: '120',
};

/** Field metadata, in the order the form lays them out. */
export const GYM_FIELD_SPECS = [
  { key: 'name', label: 'Display name', hint: 'Shown to members and on invoices' },
  { key: 'legal', label: 'Registered legal name', hint: 'Must match your GST certificate' },
  { key: 'phone', label: 'Front desk phone', hint: 'Used on reminders' },
  { key: 'email', label: 'Billing email', hint: 'Invoices and receipts go here' },
  { key: 'address', label: 'Address', hint: 'Appears on member invoices' },
  { key: 'gstin', label: 'GSTIN', hint: '15 characters' },
  { key: 'hours', label: 'Opening hours', hint: 'Check-ins outside this window are flagged' },
  { key: 'capacity', label: 'Floor capacity', hint: 'Drives the occupancy warning' },
] as const satisfies readonly { key: keyof GymProfile; label: string; hint: string }[];

export const DEFAULT_OPERATING_RULES: OperatingRules = {
  autoLock: true,
  requireId: true,
  guestPass: true,
  sms: true,
  /*
   * Off by default and it must stay that way. Turning it on disables QR
   * check-in for every member at once, which is a decision an owner makes
   * deliberately — never one they inherit from a default.
   */
  biometric: false,
};

export const OPERATING_RULE_SPECS: readonly RuleSpec[] = [
  {
    key: 'autoLock',
    label: 'Pause door access when fees are 7+ days overdue',
    meta: 'Desk staff can override once with a reason',
  },
  {
    key: 'requireId',
    label: 'Require ID proof before full access',
    meta: 'New members stay on day-pass access until verified',
  },
  {
    key: 'guestPass',
    label: 'Allow desk staff to sell day passes',
    meta: 'Cash entries need nightly reconciliation',
  },
  {
    key: 'sms',
    label: 'Send fee reminders on WhatsApp + SMS',
    meta: '3 days before due, on due date, then weekly',
  },
  {
    key: 'biometric',
    label: 'Biometric check-in only',
    meta: 'Turning this on disables QR check-in for everyone',
  },
];

/* -------------------------------------------------------------------------- */
/* Owner                                                                      */
/* -------------------------------------------------------------------------- */

export const OWNER_FACTS: readonly { label: string; value: string; tone: 'ink' | 'ok' | 'sub' }[] =
  [
    { label: 'Phone', value: '+91 98204 00121', tone: 'ink' },
    { label: 'Email', value: 'rahul@ironhold.in', tone: 'ink' },
    { label: 'Two-factor', value: 'On · SMS', tone: 'ok' },
    { label: 'Last login', value: 'Today 6:02 PM · Pune', tone: 'sub' },
  ];

export const DATA_ACTIONS: readonly {
  id: string;
  label: string;
  meta: string;
  destructive?: boolean;
  toast: string;
}[] = [
  {
    id: 'export',
    label: 'Export everything',
    meta: 'Members, payments, attendance · CSV',
    toast: 'Export queued · emailed within 10 minutes',
  },
  {
    id: 'co-owner',
    label: 'Add a co-owner or manager',
    meta: 'Full or limited dashboard access',
    toast: 'Invite a co-owner by phone number',
  },
  {
    id: 'deactivate',
    label: 'Deactivate this gym',
    meta: 'Members lose access · data kept 90 days',
    destructive: true,
    toast: 'Deactivation needs a call with support — protects you from mistakes',
  },
];

/* -------------------------------------------------------------------------- */
/* Registration options                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Membership plans, with the price as a NUMBER.
 *
 * The source design parsed the rupee figure back out of the option label with a
 * regular expression. That works until a plan is renamed, at which point the
 * desk collects the wrong amount and nothing errors — so the amount is data,
 * and the label is built from it.
 */
export const MEMBERSHIP_PLANS: readonly MembershipPlanOption[] = [
  { id: 'monthly-gym', label: 'Monthly · Gym', amount: 2300 },
  { id: 'monthly-group', label: 'Monthly · Gym + Group', amount: 2600 },
  { id: 'quarterly-cardio', label: 'Quarterly · Gym + Cardio', amount: 6300 },
  { id: 'annual-all', label: 'Annual · All access', amount: 19800 },
  { id: 'trial-7', label: '7-day trial', amount: 0 },
];

export const TRAINER_OPTIONS: readonly TrainerOption[] = [
  { id: 'none', label: 'No trainer (gym floor only)' },
  { id: 'rahul', label: 'Rahul Mehra · 6 clients' },
  { id: 'vikram', label: 'Vikram Joshi · 4 clients' },
  {
    id: 'simran',
    label: 'Simran Kaur · on leave till 22 Aug',
    unavailableNote: 'Simran is on leave till 22 Aug — sessions start after that',
  },
];

/** Prefilled joining date. Matches `TODAY`, in the DD/MM/YYYY the form asks for. */
export const DEFAULT_JOINING_DATE = '19/08/2026';

/* -------------------------------------------------------------------------- */
/* Entitlements                                                               */
/* -------------------------------------------------------------------------- */

/**
 * What this gym's subscription includes.
 *
 * Trainer mobile is a paid add-on, so the console has to render two entirely
 * different screens for it — the working one and the upsell. Modelling it as an
 * entitlement rather than a `true` sprinkled through components keeps the locked
 * path reachable and testable.
 */
export interface Entitlements {
  trainerApp: boolean;
}

export const ENTITLEMENTS: Entitlements = {
  trainerApp: true,
};

/* -------------------------------------------------------------------------- */
/* Trainer app permissions                                                    */
/* -------------------------------------------------------------------------- */

export const DEFAULT_TRAINER_PERMISSIONS: Record<TrainerPermission, boolean> = {
  clients: true,
  plans: true,
  attendance: true,
  // Money stays with the owner unless they deliberately share it.
  fees: false,
  revenue: false,
};

export const TRAINER_PERMISSION_SPECS: readonly PermissionSpec[] = [
  {
    key: 'clients',
    label: 'Client profiles & history',
    meta: 'only clients assigned to them',
  },
  { key: 'plans', label: 'Build and edit workout plans', meta: 'templates stay owner-approved' },
  {
    key: 'attendance',
    label: 'Mark attendance from the floor',
    meta: 'writes to your check-in register',
  },
  { key: 'fees', label: 'See member fee status', meta: 'off by default · money stays with you' },
  { key: 'revenue', label: 'See gym revenue', meta: 'never recommended for trainers' },
];
